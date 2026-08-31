#[cfg(unix)]
use libc::{
    self, c_char, close, dup2, execvp, fcntl, fork, ioctl, pipe, poll, pollfd, setsid, winsize,
    FD_CLOEXEC, F_SETFD, POLLIN, TIOCSCTTY, TIOCSWINSZ, WNOHANG,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[cfg(unix)]
use std::ffi::CString;
#[cfg(unix)]
use std::os::fd::RawFd;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::AppHandle;
#[cfg(unix)]
use tauri::Emitter;

#[cfg(not(unix))]
type RawFd = i32;

const DEFAULT_PTY_ROWS: u16 = 24;
const DEFAULT_PTY_COLS: u16 = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyInfo {
    pub id: String,
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutput {
    pub id: String,
    pub data: String,
}

struct PtySession {
    #[cfg(unix)]
    master_fd: RawFd,
    #[cfg(unix)]
    pid: i32,
    #[cfg(unix)]
    exec_fd: RawFd,
    running: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

#[cfg(unix)]
fn reap_child(pid: i32) {
    for _ in 0..20 {
        let result = unsafe { libc::waitpid(pid, std::ptr::null_mut(), WNOHANG) };
        if result != 0 {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

#[cfg(unix)]
fn decode_utf8_stream_chunk(pending: &mut Vec<u8>, chunk: &[u8]) -> Option<String> {
    pending.extend_from_slice(chunk);

    let mut decoded = String::new();
    let mut consumed = 0usize;

    while consumed < pending.len() {
        match std::str::from_utf8(&pending[consumed..]) {
            Ok(valid) => {
                decoded.push_str(valid);
                consumed = pending.len();
                break;
            }
            Err(err) => {
                let valid_up_to = err.valid_up_to();
                if valid_up_to > 0 {
                    let valid_end = consumed + valid_up_to;
                    decoded.push_str(std::str::from_utf8(&pending[consumed..valid_end]).unwrap());
                    consumed = valid_end;
                }

                match err.error_len() {
                    Some(invalid_len) => {
                        decoded.push('\u{FFFD}');
                        consumed += invalid_len;
                    }
                    None => break,
                }
            }
        }
    }

    if consumed > 0 {
        pending.drain(..consumed);
    }

    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

#[cfg(unix)]
fn flush_pending_utf8(pending: &mut Vec<u8>) -> Option<String> {
    if pending.is_empty() {
        return None;
    }

    let decoded = String::from_utf8_lossy(pending).to_string();
    pending.clear();

    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

#[cfg(unix)]
fn emit_pty_data(app: &AppHandle, id: &str, data: String) {
    if data.is_empty() {
        return;
    }

    let output = PtyOutput {
        id: id.to_string(),
        data,
    };
    let _ = app.emit(&format!("pty:data:{}", id), output);
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    #[cfg(unix)]
    fn errno() -> i32 {
        std::io::Error::last_os_error()
            .raw_os_error()
            .unwrap_or_default()
    }

    #[cfg(unix)]
    fn open_pty() -> Result<(RawFd, RawFd), String> {
        unsafe {
            let master_fd = libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY);
            if master_fd < 0 {
                return Err(format!("Failed to open master PTY: {}", Self::errno()));
            }

            if libc::grantpt(master_fd) != 0 {
                close(master_fd);
                return Err(format!("Failed to grant PTY: {}", Self::errno()));
            }

            if libc::unlockpt(master_fd) != 0 {
                close(master_fd);
                return Err(format!("Failed to unlock PTY: {}", Self::errno()));
            }

            let pts_name_ptr = libc::ptsname(master_fd);
            if pts_name_ptr.is_null() {
                close(master_fd);
                return Err(format!("Failed to get PTY name: {}", Self::errno()));
            }

            let slave_fd = libc::open(pts_name_ptr, libc::O_RDWR | libc::O_NOCTTY);
            if slave_fd < 0 {
                close(master_fd);
                return Err(format!("Failed to open slave PTY: {}", Self::errno()));
            }

            Ok((master_fd, slave_fd))
        }
    }

    #[cfg(not(unix))]
    fn unsupported_error() -> String {
        "Terminal sessions are not supported on this platform yet".to_string()
    }

    #[cfg(unix)]
    fn set_winsize(fd: RawFd, rows: Option<u16>, cols: Option<u16>) -> Result<(), String> {
        let ws_row = rows.filter(|r| *r > 0).unwrap_or(DEFAULT_PTY_ROWS);
        let ws_col = cols.filter(|c| *c > 0).unwrap_or(DEFAULT_PTY_COLS);

        unsafe {
            let winsize = winsize {
                ws_row,
                ws_col,
                ws_xpixel: 0,
                ws_ypixel: 0,
            };
            if ioctl(fd, TIOCSWINSZ, &winsize) < 0 {
                return Err(format!("Failed to set PTY size: {}", Self::errno()));
            }
        }
        Ok(())
    }

    #[cfg(unix)]
    pub fn create_session(
        &self,
        shell: Option<&str>,
        cwd: Option<&str>,
        rows: Option<u16>,
        cols: Option<u16>,
    ) -> Result<PtyInfo, String> {
        let shell_path = if let Some(s) = shell {
            s.to_string()
        } else {
            Self::get_default_shell()
        };

        let cwd_path = match cwd {
            Some(c) if !c.is_empty() && c != "~" => c.to_string(),
            _ => std::env::var("HOME").unwrap_or_else(|_| "/".to_string()),
        };
        let shell_cstr = CString::new(shell_path.as_str())
            .map_err(|_| "Shell path contains interior NUL byte".to_string())?;
        let cwd_cstr = CString::new(cwd_path.as_str())
            .map_err(|_| "Working directory contains interior NUL byte".to_string())?;

        let (master_fd, slave_fd) = Self::open_pty()?;

        // Set the initial window size BEFORE the shell starts, so TUI apps
        // that query the terminal size at startup get real dimensions
        // instead of the fresh PTY's 0x0 (which makes them render tiny).
        Self::set_winsize(master_fd, rows, cols)?;

        // CLOEXEC pipe used to report exec failures back to the parent: the
        // write end closes automatically on a successful exec, and the child
        // writes the errno byte when execvp fails. Set FD_CLOEXEC manually
        // because macOS's libc has no pipe2 wrapper.
        let (exec_read_fd, exec_write_fd) = unsafe {
            let mut fds = [0 as libc::c_int; 2];
            if pipe(fds.as_mut_ptr()) != 0 {
                close(master_fd);
                close(slave_fd);
                return Err(format!(
                    "Failed to create exec status pipe: {}",
                    Self::errno()
                ));
            }
            if fcntl(fds[0], F_SETFD, FD_CLOEXEC) < 0 || fcntl(fds[1], F_SETFD, FD_CLOEXEC) < 0 {
                close(fds[0]);
                close(fds[1]);
                close(master_fd);
                close(slave_fd);
                return Err(format!(
                    "Failed to set CLOEXEC on exec status pipe: {}",
                    Self::errno()
                ));
            }
            (fds[0], fds[1])
        };

        let has_lang = std::env::var("LANG")
            .map(|value| !value.is_empty())
            .unwrap_or(false);

        let pid = unsafe { fork() };

        if pid < 0 {
            unsafe {
                close(master_fd);
                close(slave_fd);
                close(exec_read_fd);
                close(exec_write_fd);
            }
            return Err(format!("Failed to fork: {}", Self::errno()));
        }

        if pid == 0 {
            unsafe {
                close(master_fd);

                if setsid() < 0 {
                    libc::_exit(1);
                }

                if ioctl(slave_fd, TIOCSCTTY as _, 0) < 0 {
                    libc::_exit(1);
                }

                if dup2(slave_fd, 0) < 0 || dup2(slave_fd, 1) < 0 || dup2(slave_fd, 2) < 0 {
                    libc::_exit(1);
                }

                if slave_fd > 2 {
                    close(slave_fd);
                }

                if libc::chdir(cwd_cstr.as_ptr()) != 0 {
                    libc::_exit(1);
                }

                libc::setenv(
                    b"TERM\0".as_ptr() as *const c_char,
                    b"xterm-256color\0".as_ptr() as *const c_char,
                    1,
                );

                if !has_lang {
                    libc::setenv(
                        b"LANG\0".as_ptr() as *const c_char,
                        b"en_US.UTF-8\0".as_ptr() as *const c_char,
                        1,
                    );
                }

                let login_flag = CString::new("-l").unwrap();
                let args = [shell_cstr.as_ptr(), login_flag.as_ptr(), std::ptr::null()];
                execvp(shell_cstr.as_ptr(), args.as_ptr());
                let exec_errno = Self::errno() as u8;
                libc::write(exec_write_fd, (&exec_errno as *const u8).cast(), 1);
                libc::_exit(1);
            }
        }

        unsafe {
            close(slave_fd);
            close(exec_write_fd);
        }

        let session_id = format!("pty-{}", Self::uuid_simple());
        let running = Arc::new(AtomicBool::new(true));

        {
            let mut sessions = self.sessions.lock();
            sessions.insert(
                session_id.clone(),
                PtySession {
                    master_fd,
                    pid,
                    exec_fd: exec_read_fd,
                    running: running.clone(),
                    handle: None,
                },
            );
        }

        Ok(PtyInfo {
            id: session_id,
            pid: pid as u32,
        })
    }

    #[cfg(not(unix))]
    pub fn create_session(
        &self,
        shell: Option<&str>,
        cwd: Option<&str>,
        rows: Option<u16>,
        cols: Option<u16>,
    ) -> Result<PtyInfo, String> {
        let _ = (shell, cwd, rows, cols);
        Err(Self::unsupported_error())
    }

    #[cfg(unix)]
    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let master_fd = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => session.master_fd,
                None => return Err("Session not found".to_string()),
            }
        };

        let bytes = data.as_bytes();
        let mut written = 0;

        while written < bytes.len() {
            let result = unsafe {
                libc::write(
                    master_fd,
                    bytes[written..].as_ptr().cast(),
                    (bytes.len() - written) as _,
                )
            };

            if result == 0 {
                return Err("Write error: wrote 0 bytes to PTY".to_string());
            }

            if result < 0 {
                let err = std::io::Error::last_os_error();
                if err.kind() == std::io::ErrorKind::Interrupted {
                    continue;
                }
                return Err(format!("Write error: {}", err));
            }

            written += result as usize;
        }

        Ok(())
    }

    #[cfg(not(unix))]
    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let _ = (id, data);
        Err(Self::unsupported_error())
    }

    #[cfg(unix)]
    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let master_fd = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => session.master_fd,
                None => return Err("Session not found".to_string()),
            }
        };

        Self::set_winsize(master_fd, Some(rows), Some(cols))
    }

    #[cfg(not(unix))]
    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let _ = (id, rows, cols);
        Err(Self::unsupported_error())
    }

    #[cfg(unix)]
    pub fn read_output(&self, id: &str, app: AppHandle) {
        let (master_fd, pid, exec_fd, running) = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => (
                    session.master_fd,
                    session.pid,
                    session.exec_fd,
                    session.running.clone(),
                ),
                None => return,
            }
        };

        let id_clone = id.to_string();
        let app_clone = app.clone();

        let handle = thread::spawn(move || {
            // Wait for the exec outcome first: the pipe's write end closes on
            // a successful exec, or delivers the errno byte on failure. The
            // bounded poll keeps the running flag responsive so a concurrent
            // close cannot deadlock on this read.
            let mut exec_err = [0u8; 1];
            loop {
                if !running.load(Ordering::Relaxed) {
                    return;
                }
                let mut exec_pfd = pollfd {
                    fd: exec_fd,
                    events: POLLIN,
                    revents: 0,
                };
                let exec_poll = unsafe { poll(&mut exec_pfd as *mut pollfd, 1, 500) };
                if exec_poll < 0 {
                    let err = std::io::Error::last_os_error();
                    if err.kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }
                    break;
                }
                if exec_poll == 0 {
                    continue;
                }
                let exec_read = unsafe { libc::read(exec_fd, exec_err.as_mut_ptr().cast(), 1) };
                if exec_read == 1 {
                    let reason = std::io::Error::from_raw_os_error(exec_err[0] as i32);
                    emit_pty_data(
                        &app_clone,
                        &id_clone,
                        format!("\r\n[Failed to start shell: {}]\r\n", reason),
                    );
                    let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                    reap_child(pid);
                    return;
                }
                break;
            }

            let mut buf = [0u8; 8192];
            // PTY reads can split a single UTF-8 code point across buffers.
            // Keep the trailing partial bytes and decode them together with the next chunk.
            let mut utf8_pending = Vec::new();
            let mut pfd = pollfd {
                fd: master_fd,
                events: POLLIN,
                revents: 0,
            };

            while running.load(Ordering::Relaxed) {
                // Use poll with 500ms timeout so we can check the running flag
                let poll_result = unsafe { poll(&mut pfd as *mut pollfd, 1, 500) };

                if poll_result < 0 {
                    let err = std::io::Error::last_os_error();
                    if err.kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }
                    break;
                }

                if poll_result == 0 {
                    continue; // Timeout, loop back to check running flag
                }

                let read_result =
                    unsafe { libc::read(master_fd, buf.as_mut_ptr().cast(), buf.len()) };

                if read_result == 0 {
                    if let Some(data) = flush_pending_utf8(&mut utf8_pending) {
                        emit_pty_data(&app_clone, &id_clone, data);
                    }
                    let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                    reap_child(pid);
                    break;
                }

                if read_result < 0 {
                    let err = std::io::Error::last_os_error();
                    if err.kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }

                    if err.kind() != std::io::ErrorKind::WouldBlock {
                        if let Some(data) = flush_pending_utf8(&mut utf8_pending) {
                            emit_pty_data(&app_clone, &id_clone, data);
                        }
                        emit_pty_data(
                            &app_clone,
                            &id_clone,
                            format!("\r\n[Read error: {}]\r\n", err),
                        );
                    }
                    // The shell is gone for good (on Linux a dead child makes
                    // the master read fail with EIO instead of returning 0),
                    // so notify the frontend and reap the child here too.
                    let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                    reap_child(pid);
                    break;
                }

                if let Some(data) =
                    decode_utf8_stream_chunk(&mut utf8_pending, &buf[..read_result as usize])
                {
                    emit_pty_data(&app_clone, &id_clone, data);
                }
            }
        });

        // Store the join handle
        let mut sessions = self.sessions.lock();
        if let Some(session) = sessions.get_mut(id) {
            session.handle = Some(handle);
        }
    }

    #[cfg(not(unix))]
    pub fn read_output(&self, id: &str, app: AppHandle) {
        let _ = (id, app);
    }

    #[cfg(unix)]
    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let (master_fd, pid, exec_fd, running, handle) = {
            let mut sessions = self.sessions.lock();
            match sessions.remove(id) {
                Some(session) => (
                    session.master_fd,
                    session.pid,
                    session.exec_fd,
                    session.running,
                    session.handle,
                ),
                None => return Err("Session not found".to_string()),
            }
        };

        // Signal the read thread to stop and wait for it BEFORE closing the
        // fds: closing first would let a new PTY reuse the fd numbers while
        // the reader is still between poll() and read().
        running.store(false, Ordering::Relaxed);
        if let Some(handle) = handle {
            let _ = handle.join();
        }

        unsafe {
            close(master_fd);
            close(exec_fd);
        }

        reap_child(pid);

        Ok(())
    }

    #[cfg(not(unix))]
    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let _ = id;
        Err(Self::unsupported_error())
    }

    pub fn close_all(&self) {
        let sessions: Vec<PtySession> = {
            let mut sessions = self.sessions.lock();
            sessions.drain().map(|(_, session)| session).collect()
        };

        for session in sessions {
            session.running.store(false, Ordering::Relaxed);

            if let Some(handle) = session.handle {
                let _ = handle.join();
            }

            #[cfg(unix)]
            unsafe {
                close(session.master_fd);
                close(session.exec_fd);
            }
        }
    }

    pub fn get_default_shell() -> String {
        #[cfg(target_os = "macos")]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        }
        #[cfg(target_os = "linux")]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
        #[cfg(target_os = "windows")]
        {
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            "/bin/bash".to_string()
        }
    }

    fn uuid_simple() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        format!(
            "{:x}{:x}{:x}",
            duration.as_secs(),
            duration.subsec_nanos(),
            rand::random::<u16>()
        )
    }
}

pub fn create_pty_manager() -> Arc<PtyManager> {
    Arc::new(PtyManager::new())
}

#[cfg(all(test, unix))]
mod tests {
    use super::{decode_utf8_stream_chunk, flush_pending_utf8};

    #[test]
    fn keeps_split_utf8_until_the_character_is_complete() {
        let mut pending = Vec::new();

        assert_eq!(decode_utf8_stream_chunk(&mut pending, &[0xE4, 0xBD]), None);
        assert_eq!(
            decode_utf8_stream_chunk(&mut pending, &[0xA0, 0xE5, 0xA5]),
            Some("你".to_string())
        );
        assert_eq!(
            decode_utf8_stream_chunk(&mut pending, &[0xBD]),
            Some("好".to_string())
        );
        assert_eq!(flush_pending_utf8(&mut pending), None);
    }

    #[test]
    fn replaces_invalid_utf8_without_dropping_following_text() {
        let mut pending = Vec::new();

        assert_eq!(
            decode_utf8_stream_chunk(&mut pending, &[b'f', b'o', 0x80, b'o']),
            Some("fo\u{FFFD}o".to_string())
        );
        assert_eq!(flush_pending_utf8(&mut pending), None);
    }
}
