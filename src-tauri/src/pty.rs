#[cfg(unix)]
use libc::{
    self, c_char, close, dup2, execvp, fcntl, fork, ioctl, pipe, poll, pollfd, setsid, winsize,
    FD_CLOEXEC, F_SETFD, POLLIN, TIOCSCTTY, TIOCSWINSZ, WNOHANG,
};
use parking_lot::Mutex;
#[cfg(windows)]
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
// Kill handles are a separate type from the child on portable-pty 0.8, and
// `clone_killer` may resolve either as a `Child` method or through the
// `ChildKiller` blanket impl depending on the exact release. The trait is
// imported — and allowed to go unused — so the call compiles either way.
// Drop the import if a future bump makes it resolvable without this.
#[cfg(windows)]
#[allow(unused_imports)]
use portable_pty::ChildKiller;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[cfg(unix)]
use std::ffi::CString;
#[cfg(windows)]
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::fd::RawFd;
// `test` too: the Windows path/shell policy is exercised from any host.
#[cfg(any(windows, test))]
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::AppHandle;
use tauri::Emitter;

const DEFAULT_PTY_ROWS: u16 = 24;
const DEFAULT_PTY_COLS: u16 = 80;

/// What `create_pty_session` hands back to the frontend: the session id every
/// later command and every `pty:*` event is keyed by. The OS process id is
/// deliberately *not* part of this contract — the unix backend keeps its own
/// copy on `PtySession` for `reap_child`, and nothing on the UI side ever read
/// the serialized one.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyInfo {
    pub id: String,
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
    #[cfg(windows)]
    windows: Option<WindowsPty>,
    #[cfg(windows)]
    /// Handed to the reader thread by `read_output`; stays here until then.
    reader: Option<Box<dyn Read + Send>>,
    running: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

/// Windows side of a terminal session, backed by ConPTY via portable-pty.
#[cfg(windows)]
struct WindowsPty {
    /// Holds the last handle to the pseudoconsole: the slave owns nothing once
    /// `spawn_command` returned, so dropping the master releases the ConPTY.
    /// That is what makes the reader thread's pipe report EOF — the Windows
    /// equivalent of closing the unix master fd, and the reason every close
    /// path must drop it *before* joining the reader.
    master: Option<Box<dyn MasterPty + Send>>,
    /// Cloned out of the session map so a write never holds the map lock
    /// while it blocks on a full input pipe.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
}

/// Terminate a ConPTY shell and reap it, bounded.
///
/// Closing the pseudoconsole alone can leave a shell that ignores the
/// console-close event running headless, and `Child::wait()` has no timeout —
/// `close_all()` runs synchronously on `ExitRequested`, so an unkillable shell
/// must not be able to hold the app's shutdown hostage. Mirrors the unix
/// `reap_child` polling loop; a shell that outlives the window is left to the
/// OS, which has no zombie state to leak (only a handle released on exit).
#[cfg(windows)]
fn terminate_shell(child: &mut (dyn Child + Send + Sync)) {
    let mut killer = child.clone_killer();
    if let Err(err) = killer.kill() {
        eprintln!("[pty] failed to terminate the Windows shell: {}", err);
    }

    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => thread::sleep(std::time::Duration::from_millis(10)),
            Err(err) => {
                eprintln!("[pty] failed to reap the Windows shell: {}", err);
                return;
            }
        }
    }
    eprintln!("[pty] Windows shell ignored termination; abandoning the reap");
}

#[cfg(windows)]
impl WindowsPty {
    /// Close the pty first (that is what unblocks the reader thread), then
    /// terminate and reap the shell.
    fn close(&mut self) {
        self.master = None;
        terminate_shell(self.child.as_mut());
    }
}

/// Bounds how long a close path waits for the reader thread to notice EOF.
#[cfg(windows)]
const READER_JOIN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// Joins a Windows reader thread with a bound.
///
/// Closing the pty is what unblocks the reader's blocking read (see the
/// comment in `read_output`), and that is the one assumption in this backend
/// no macOS host can check. If it ever fails to hold, an unbounded `join()`
/// would freeze the caller — `close_session` runs on the UI thread and
/// `close_all` on the exit path — so the wait is capped and a reader that
/// never stops is abandoned with a log line instead. The helper thread exits
/// together with the reader; only a genuinely stuck reader leaks it.
#[cfg(windows)]
fn join_reader_bounded(handle: thread::JoinHandle<()>) {
    let (done_tx, done_rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let _ = handle.join();
        let _ = done_tx.send(());
    });

    if done_rx.recv_timeout(READER_JOIN_TIMEOUT).is_err() {
        eprintln!("[pty] reader thread did not stop after the pty was closed; abandoning it");
    }
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

/// Interactive-session flags for a Windows shell family, keyed by executable
/// name only — no filesystem access, so the policy is covered by `cargo test`
/// on any host.
#[cfg(any(windows, test))]
fn shell_args_for(file_name: &str) -> Vec<String> {
    match file_name.to_ascii_lowercase().as_str() {
        "powershell.exe" | "pwsh.exe" => vec!["-NoLogo".to_string()],
        "bash.exe" => vec!["--login".to_string(), "-i".to_string()],
        _ => Vec::new(),
    }
}

/// Drops duplicate candidate paths, keeping the first occurrence: Windows
/// paths are case-insensitive, so `C:\WINDOWS\...\cmd.exe` and
/// `C:\Windows\...\cmd.exe` are the same shell.
#[cfg(any(windows, test))]
fn dedupe_paths_case_insensitive(candidates: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.to_ascii_lowercase()))
        .collect()
}

/// Picks the directory a Windows shell should start in. `is_dir` is injected
/// so the policy — a usable requested directory wins, otherwise the user
/// profile — is testable without touching the filesystem.
#[cfg(any(windows, test))]
fn choose_windows_working_dir(
    requested: Option<&str>,
    profile: Option<&Path>,
    is_dir: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    let requested = requested
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "~")
        .map(PathBuf::from);
    if let Some(dir) = requested {
        if is_dir(&dir) {
            return Some(dir);
        }
    }
    profile.filter(|dir| is_dir(dir)).map(PathBuf::from)
}

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

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

    #[cfg(not(any(unix, windows)))]
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

        Ok(PtyInfo { id: session_id })
    }

    // Windows sessions run the shell under ConPTY (Windows 10 1809+), the same
    // mechanism VS Code's node-pty and Windows Terminal use. The frontend
    // contract is identical to the unix path: a session id, a stream of UTF-8
    // `pty:data:<id>` chunks and one `pty:exit:<id>`.
    #[cfg(windows)]
    pub fn create_session(
        &self,
        shell: Option<&str>,
        cwd: Option<&str>,
        rows: Option<u16>,
        cols: Option<u16>,
    ) -> Result<PtyInfo, String> {
        let shell_path = shell
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(Self::get_default_shell);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.filter(|r| *r > 0).unwrap_or(DEFAULT_PTY_ROWS),
                cols: cols.filter(|c| *c > 0).unwrap_or(DEFAULT_PTY_COLS),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|err| {
                format!(
                    "Failed to open ConPTY (Windows 10 1809 or newer required): {}",
                    err
                )
            })?;

        let mut command = CommandBuilder::new(shell_path.as_str());
        for arg in Self::windows_shell_args(&shell_path) {
            command.arg(arg);
        }
        if let Some(dir) = Self::windows_working_dir(cwd) {
            command.cwd(dir);
        }

        // Build the child environment explicitly from the parent's instead of
        // relying on "inherit unless an override is set": whether a non-empty
        // env list replaces or merges with the inherited environment is a
        // portable-pty implementation detail, and a replaced environment would
        // strip PATH. The parent env is what Explorer handed the app, which is
        // also what a shell started from the Start menu would see.
        command.env_clear();
        for (key, value) in std::env::vars_os() {
            command.env(key, value);
        }
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");

        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|err| format!("Failed to start shell: {}", err))?;

        // The slave owns nothing the running session needs: on Windows the
        // pseudoconsole lives in the master, which is kept for the session's
        // lifetime (dropping it is what closes the pty).
        drop(pair.slave);

        // From here on the shell is already attached to the pseudoconsole, so
        // every failure has to take the child down with it — the session's
        // `close()` invariant (never leave a headless shell) applies to the
        // construction path too.
        let reader = match pair.master.try_clone_reader() {
            Ok(reader) => reader,
            Err(err) => {
                terminate_shell(child.as_mut());
                return Err(format!("Failed to clone ConPTY reader: {}", err));
            }
        };
        let writer = match pair.master.take_writer() {
            Ok(writer) => writer,
            Err(err) => {
                terminate_shell(child.as_mut());
                return Err(format!("Failed to take ConPTY writer: {}", err));
            }
        };

        let session_id = format!("pty-{}", Self::uuid_simple());
        let running = Arc::new(AtomicBool::new(true));

        {
            let mut sessions = self.sessions.lock();
            sessions.insert(
                session_id.clone(),
                PtySession {
                    windows: Some(WindowsPty {
                        master: Some(pair.master),
                        writer: Arc::new(Mutex::new(writer)),
                        child,
                    }),
                    reader: Some(reader),
                    running: running.clone(),
                    handle: None,
                },
            );
        }

        Ok(PtyInfo { id: session_id })
    }

    #[cfg(not(any(unix, windows)))]
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

    #[cfg(windows)]
    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        // Clone the writer out of the map, then release the map lock: the
        // write below blocks when the console input buffer is full, and
        // holding the session map for that would stall every other tab.
        let writer = {
            let sessions = self.sessions.lock();
            match sessions
                .get(id)
                .and_then(|session| session.windows.as_ref())
            {
                Some(pty) => pty.writer.clone(),
                None => return Err("Session not found".to_string()),
            }
        };

        let mut writer = writer.lock();
        writer
            .write_all(data.as_bytes())
            .map_err(|err| format!("Write error: {}", err))?;
        writer
            .flush()
            .map_err(|err| format!("Write error: {}", err))?;
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
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

    #[cfg(windows)]
    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        // Unlike `write`, this deliberately keeps the session lock for the
        // duration: the lock is what keeps the master handle alive (close
        // drops it under the same lock), and `ResizePseudoConsole` has none of
        // `WriteFile`'s blocking-on-a-full-buffer semantics that force `write`
        // to run outside the lock.
        let sessions = self.sessions.lock();
        let master = sessions
            .get(id)
            .and_then(|session| session.windows.as_ref())
            .and_then(|pty| pty.master.as_ref())
            .ok_or_else(|| "Session not found".to_string())?;

        master
            .resize(PtySize {
                // ResizePseudoConsole rejects a zero dimension.
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|err| format!("Failed to resize ConPTY: {}", err))
    }

    #[cfg(not(any(unix, windows)))]
    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let _ = (id, rows, cols);
        Err(Self::unsupported_error())
    }

    #[cfg(unix)]
    pub fn read_output(&self, id: &str, app: AppHandle) -> Result<(), String> {
        let (master_fd, pid, exec_fd, running) = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => (
                    session.master_fd,
                    session.pid,
                    session.exec_fd,
                    session.running.clone(),
                ),
                None => return Err("Session not found".to_string()),
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

        Ok(())
    }

    #[cfg(windows)]
    pub fn read_output(&self, id: &str, app: AppHandle) -> Result<(), String> {
        let (reader, running) = {
            let mut sessions = self.sessions.lock();
            let session = sessions
                .get_mut(id)
                .ok_or_else(|| "Session not found".to_string())?;
            let reader = session
                .reader
                .take()
                .ok_or_else(|| "PTY reader already started".to_string())?;
            (reader, session.running.clone())
        };

        let id_clone = id.to_string();
        let app_clone = app.clone();
        let thread_running = running.clone();

        let handle = thread::spawn(move || {
            let mut reader = reader;
            let running = thread_running;
            let mut buf = [0u8; 8192];
            // ConPTY emits UTF-8, and a read can still split a code point
            // across buffers, so trailing partial bytes are carried into the
            // next read — same handling as the unix path.
            let mut utf8_pending = Vec::new();

            // This is a plain blocking read, so the `running` flag below can
            // only stop the loop *between* reads: a read already in flight is
            // unblocked solely by `close_session`/`close_all` dropping the
            // master (ClosePseudoConsole ⇒ the pipe reports EOF). That is why
            // both close paths drop the pty before joining this thread, and
            // why the join goes through `join_reader_bounded` — the unix path
            // instead polls with a 500ms timeout and can therefore observe
            // `running` without help from the pty. Do not reorder the close
            // paths without replacing one of those two mechanisms.
            loop {
                if !running.load(Ordering::Relaxed) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        if let Some(data) = flush_pending_utf8(&mut utf8_pending) {
                            emit_pty_data(&app_clone, &id_clone, data);
                        }
                        let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                        break;
                    }
                    Ok(read) => {
                        if let Some(data) =
                            decode_utf8_stream_chunk(&mut utf8_pending, &buf[..read])
                        {
                            emit_pty_data(&app_clone, &id_clone, data);
                        }
                    }
                    Err(err) => {
                        if err.kind() == std::io::ErrorKind::Interrupted {
                            continue;
                        }
                        if let Some(data) = flush_pending_utf8(&mut utf8_pending) {
                            emit_pty_data(&app_clone, &id_clone, data);
                        }
                        let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                        break;
                    }
                }
            }
        });

        let mut sessions = self.sessions.lock();
        if let Some(session) = sessions.get_mut(id) {
            session.handle = Some(handle);
            return Ok(());
        }

        // The session was closed while the reader was starting up, so nobody
        // can observe or join this thread: reap it here instead of silently
        // detaching it. Closing the session dropped the master, which is what
        // unblocks the read this thread is sitting in.
        drop(sessions);
        running.store(false, Ordering::Relaxed);
        join_reader_bounded(handle);

        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
    pub fn read_output(&self, id: &str, app: AppHandle) -> Result<(), String> {
        let _ = (id, app);
        Err(Self::unsupported_error())
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

    #[cfg(windows)]
    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let mut session = {
            let mut sessions = self.sessions.lock();
            sessions.remove(id)
        }
        .ok_or_else(|| "Session not found".to_string())?;

        session.running.store(false, Ordering::Relaxed);

        // Close the pseudoconsole before joining the reader: closing it makes
        // the reader's pipe report EOF, so the join cannot hang on a shell
        // that survives termination.
        if let Some(mut pty) = session.windows.take() {
            pty.close();
        }
        // The reader (if `read_output` never ran) and the join handle are both
        // dropped with `session` below; the reader is only a duplicated pipe
        // handle, so releasing it after the pty is closed is fine.
        if let Some(handle) = session.handle.take() {
            join_reader_bounded(handle);
        }

        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
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

            // Close the pty first: it is what unblocks the reader thread, so
            // the join below cannot wait on a still-running shell.
            #[cfg(windows)]
            if let Some(mut pty) = session.windows {
                pty.close();
            }

            if let Some(handle) = session.handle {
                #[cfg(windows)]
                join_reader_bounded(handle);
                #[cfg(unix)]
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
        #[cfg(windows)]
        {
            // PowerShell 7 first when installed. This is a deliberate
            // deviation, not VS Code parity: VS Code's own default profile on
            // Windows has historically been Windows PowerShell 5.1, and the
            // modern default is what a terminal shipped today should prefer.
            // `COMSPEC` is only the last resort — it is always cmd.exe and
            // would otherwise pin every user to it.
            if let Some(pwsh) = Self::windows_find_executable_on_path("pwsh.exe") {
                return pwsh;
            }
            if let Some(powershell) = Self::windows_powershell_path() {
                return powershell;
            }
            if let Some(powershell) = Self::windows_find_executable_on_path("powershell.exe") {
                return powershell;
            }
            std::env::var("COMSPEC")
                .ok()
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "cmd.exe".to_string())
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
        {
            "/bin/bash".to_string()
        }
    }

    /// Shells offered in the terminal's shell picker. Unix keeps the fixed
    /// candidate list; Windows probes the well-known install locations because
    /// there is no `/etc/shells` equivalent.
    pub fn list_shells() -> Vec<String> {
        #[cfg(unix)]
        {
            vec![
                "/bin/zsh",
                "/bin/bash",
                "/bin/sh",
                "/usr/local/bin/fish",
                "/opt/homebrew/bin/fish",
            ]
            .into_iter()
            .filter(|path| std::path::Path::new(*path).exists())
            .map(|path| path.to_string())
            .collect()
        }

        #[cfg(windows)]
        {
            let mut candidates = Vec::new();

            if let Some(pwsh) = Self::windows_find_executable_on_path("pwsh.exe") {
                candidates.push(pwsh);
            }
            if let Some(powershell) = Self::windows_powershell_path() {
                candidates.push(powershell);
            }
            if let Some(system_root) = std::env::var_os("SystemRoot") {
                let system32 = std::path::Path::new(&system_root).join("System32");
                candidates.push(system32.join("cmd.exe").to_string_lossy().into_owned());
                candidates.push(system32.join("wsl.exe").to_string_lossy().into_owned());
            }
            // Git for Windows (machine-wide and per-user), MSYS2, Cygwin.
            if let Some(program_files) = std::env::var_os("ProgramFiles") {
                candidates.push(
                    std::path::Path::new(&program_files)
                        .join("Git")
                        .join("bin")
                        .join("bash.exe")
                        .to_string_lossy()
                        .into_owned(),
                );
            }
            if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
                candidates.push(
                    std::path::Path::new(&local_app_data)
                        .join("Programs")
                        .join("Git")
                        .join("bin")
                        .join("bash.exe")
                        .to_string_lossy()
                        .into_owned(),
                );
            }
            candidates.push(r"C:\msys64\usr\bin\bash.exe".to_string());
            candidates.push(r"C:\cygwin64\bin\bash.exe".to_string());

            candidates.retain(|path| std::path::Path::new(path).is_file());
            dedupe_paths_case_insensitive(candidates)
        }

        #[cfg(not(any(unix, windows)))]
        {
            Vec::new()
        }
    }

    #[cfg(windows)]
    fn windows_find_executable_on_path(executable: &str) -> Option<String> {
        let path = std::env::var_os("PATH")?;
        std::env::split_paths(&path)
            .map(|dir| dir.join(executable))
            .find(|candidate| candidate.is_file())
            .map(|candidate| candidate.to_string_lossy().into_owned())
    }

    #[cfg(windows)]
    fn windows_powershell_path() -> Option<String> {
        let system_root = std::env::var_os("SystemRoot")?;
        let powershell = std::path::Path::new(&system_root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        powershell
            .is_file()
            .then(|| powershell.to_string_lossy().into_owned())
    }

    /// Interactive-session flags for a Windows shell, decided from the
    /// executable *name* alone so the policy stays unit-testable off Windows
    /// (the caller resolves the name, the tests feed names directly).
    /// PowerShell needs `-NoLogo` to keep its banner out of the terminal, and
    /// Git Bash / MSYS2 need the interactive login flags that stand in for the
    /// unix `-l`. cmd/wsl/nu take none.
    #[cfg(windows)]
    fn windows_shell_args(shell: &str) -> Vec<String> {
        let file_name = std::path::Path::new(shell)
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        shell_args_for(&file_name)
    }

    /// Working directory for a new Windows session. `USERPROFILE` wins over
    /// `HOME`: a git-bash style HOME (`/c/Users/me`) is a valid POSIX path but
    /// not a valid Windows directory, and CreateProcessW fails outright on a
    /// cwd it cannot resolve. A requested directory that does not exist falls
    /// back silently — the shell starting in the profile beats not starting.
    #[cfg(windows)]
    fn windows_working_dir(cwd: Option<&str>) -> Option<PathBuf> {
        let profile = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from);
        choose_windows_working_dir(cwd, profile.as_deref(), |dir| dir.is_dir())
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

#[cfg(test)]
mod tests {
    use super::{
        choose_windows_working_dir, decode_utf8_stream_chunk, dedupe_paths_case_insensitive,
        flush_pending_utf8, shell_args_for,
    };
    use std::path::{Path, PathBuf};

    #[test]
    fn windows_shell_args_are_per_family() {
        assert_eq!(shell_args_for("pwsh.exe"), vec!["-NoLogo".to_string()]);
        assert_eq!(
            shell_args_for("PowerShell.exe"),
            vec!["-NoLogo".to_string()]
        );
        assert_eq!(
            shell_args_for("bash.exe"),
            vec!["--login".to_string(), "-i".to_string()]
        );
        assert!(shell_args_for("cmd.exe").is_empty());
        assert!(shell_args_for("wsl.exe").is_empty());
        assert!(shell_args_for("nu.exe").is_empty());
        assert!(shell_args_for("").is_empty());
    }

    #[test]
    fn windows_shell_duplicates_are_dropped_case_insensitively() {
        let deduped = dedupe_paths_case_insensitive(vec![
            r"C:\Windows\System32\cmd.exe".to_string(),
            r"c:\windows\system32\cmd.exe".to_string(),
            r"C:\Program Files\Git\bin\bash.exe".to_string(),
        ]);

        assert_eq!(
            deduped,
            vec![
                r"C:\Windows\System32\cmd.exe".to_string(),
                r"C:\Program Files\Git\bin\bash.exe".to_string(),
            ]
        );
    }

    #[test]
    fn windows_working_dir_prefers_a_usable_request() {
        let chosen =
            choose_windows_working_dir(Some(r"C:\work"), Some(Path::new(r"C:\Users\me")), |dir| {
                dir == Path::new(r"C:\work")
            });

        assert_eq!(chosen, Some(PathBuf::from(r"C:\work")));
    }

    #[test]
    fn windows_working_dir_falls_back_to_the_profile() {
        let chosen = choose_windows_working_dir(
            Some(r"C:\missing"),
            Some(Path::new(r"C:\Users\me")),
            |dir| dir == Path::new(r"C:\Users\me"),
        );

        assert_eq!(chosen, Some(PathBuf::from(r"C:\Users\me")));
    }

    #[test]
    fn windows_working_dir_ignores_blank_and_tilde_requests() {
        let only_profile_is_usable = |dir: &Path| dir == Path::new(r"C:\Users\me");

        for request in [None, Some(""), Some("   "), Some("~")] {
            assert_eq!(
                choose_windows_working_dir(
                    request,
                    Some(Path::new(r"C:\Users\me")),
                    only_profile_is_usable
                ),
                Some(PathBuf::from(r"C:\Users\me")),
                "request {:?}",
                request
            );
        }
    }

    #[test]
    fn windows_working_dir_is_none_without_a_usable_directory() {
        assert_eq!(
            choose_windows_working_dir(Some(r"C:\missing"), None, |_| false),
            None
        );
    }

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
