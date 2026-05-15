use libc::{
    self, c_char, c_int, close, dup2, execvp, fork, ioctl, poll, pollfd, setsid, winsize,
    POLLIN, TIOCSCTTY, TIOCSWINSZ,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::CString;
use std::os::fd::RawFd;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyInfo {
    pub id: String,
    pub pid: u32,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutput {
    pub id: String,
    pub data: String,
}

struct PtySession {
    master_fd: RawFd,
    running: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    fn errno() -> i32 {
        std::io::Error::last_os_error()
            .raw_os_error()
            .unwrap_or_default()
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    fn open_pty() -> Result<(c_int, c_int), String> {
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

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    fn open_pty() -> Result<(c_int, c_int), String> {
        Err("PTY not supported on this platform".to_string())
    }

    pub fn create_session(
        &self,
        shell: Option<&str>,
        cwd: Option<&str>,
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

        let pid = unsafe { fork() };

        if pid < 0 {
            unsafe {
                close(master_fd);
                close(slave_fd);
            }
            return Err(format!("Failed to fork: {}", pid));
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

                libc::setenv(
                    b"LANG\0".as_ptr() as *const c_char,
                    b"en_US.UTF-8\0".as_ptr() as *const c_char,
                    1,
                );

                libc::setenv(
                    b"LC_ALL\0".as_ptr() as *const c_char,
                    b"en_US.UTF-8\0".as_ptr() as *const c_char,
                    1,
                );

                let args = [shell_cstr.as_ptr(), std::ptr::null()];
                execvp(shell_cstr.as_ptr(), args.as_ptr());
                libc::_exit(1);
            }
        }

        unsafe {
            close(slave_fd);
        }

        let session_id = format!("pty-{}", Self::uuid_simple());
        let running = Arc::new(AtomicBool::new(true));

        {
            let mut sessions = self.sessions.lock();
            sessions.insert(
                session_id.clone(),
                PtySession {
                    master_fd,
                    running: running.clone(),
                    handle: None,
                },
            );
        }

        Ok(PtyInfo {
            id: session_id,
            pid: pid as u32,
            cwd: cwd_path.to_string(),
        })
    }

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

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let master_fd = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => session.master_fd,
                None => return Err("Session not found".to_string()),
            }
        };

        unsafe {
            let winsize = winsize {
                ws_row: rows,
                ws_col: cols,
                ws_xpixel: 0,
                ws_ypixel: 0,
            };
            if ioctl(master_fd, TIOCSWINSZ, &winsize) < 0 {
                return Err(format!("Resize error: {}", Self::errno()));
            }
        }
        Ok(())
    }

    pub fn read_output(&self, id: &str, app: AppHandle) {
        let (master_fd, running) = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => (session.master_fd, session.running.clone()),
                None => return,
            }
        };

        let id_clone = id.to_string();
        let app_clone = app.clone();

        let handle = thread::spawn(move || {
            let mut buf = [0u8; 8192];
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
                    let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                    break;
                }

                if read_result < 0 {
                    let err = std::io::Error::last_os_error();
                    if err.kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }

                    if err.kind() != std::io::ErrorKind::WouldBlock {
                        let output = PtyOutput {
                            id: id_clone.clone(),
                            data: format!("\r\n[Read error: {}]\r\n", err),
                        };
                        let _ = app_clone.emit(&format!("pty:data:{}", id_clone), output);
                    }
                    break;
                }

                let data = String::from_utf8_lossy(&buf[..read_result as usize]).to_string();
                let output = PtyOutput {
                    id: id_clone.clone(),
                    data,
                };
                let _ = app_clone.emit(&format!("pty:data:{}", id_clone), output);
            }
        });

        // Store the join handle
        let mut sessions = self.sessions.lock();
        if let Some(session) = sessions.get_mut(id) {
            session.handle = Some(handle);
        }
    }

    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let (master_fd, running, handle) = {
            let mut sessions = self.sessions.lock();
            match sessions.remove(id) {
                Some(session) => (session.master_fd, session.running, session.handle),
                None => return Err("Session not found".to_string()),
            }
        };

        // Signal the read thread to stop, then close the fd
        running.store(false, Ordering::Relaxed);
        unsafe {
            close(master_fd);
        }

        // Wait for the read thread to exit (with implicit timeout from poll)
        if let Some(handle) = handle {
            let _ = handle.join();
        }

        Ok(())
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
