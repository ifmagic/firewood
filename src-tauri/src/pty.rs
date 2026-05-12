use libc::{self, c_char, c_int, close, dup2, execvp, fork, ioctl, setsid, winsize, TIOCSWINSZ};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{FromRawFd, RawFd};
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
        unsafe { *libc::__errno_location() }
    }

    #[cfg(target_os = "linux")]
    fn open_pty() -> Result<(c_int, c_int), String> {
        unsafe {
            let master_fd =
                libc::open(b"/dev/ptmx\0".as_ptr() as *const c_char, libc::O_RDWR | libc::O_NOCTTY);
            if master_fd < 0 {
                return Err(format!("Failed to open master PTY: {}", Self::errno()));
            }

            if libc::grantpt(master_fd) != 0 {
                close(master_fd);
                return Err("Failed to grant PTY".to_string());
            }

            if libc::unlockpt(master_fd) != 0 {
                close(master_fd);
                return Err("Failed to unlock PTY".to_string());
            }

            let pts_name_ptr = libc::ptsname(master_fd);
            if pts_name_ptr.is_null() {
                close(master_fd);
                return Err("Failed to get PTY name".to_string());
            }

            let pts_name = std::ffi::CStr::from_ptr(pts_name_ptr);
            let pts_name_str = pts_name.to_string_lossy().to_string();

            let slave_fd = libc::open(
                pts_name_str.as_ptr() as *const c_char,
                libc::O_RDWR | libc::O_NOCTTY,
            );
            if slave_fd < 0 {
                close(master_fd);
                return Err(format!("Failed to open slave PTY: {}", Self::errno()));
            }

            Ok((master_fd, slave_fd))
        }
    }

    #[cfg(not(target_os = "linux"))]
    fn open_pty() -> Result<(c_int, c_int), String> {
        Err("PTY not supported on this platform".to_string())
    }

    pub fn create_session(
        &self,
        shell: Option<&str>,
        cwd: Option<&str>,
    ) -> Result<PtyInfo, String> {
        let (master_fd, slave_fd) = Self::open_pty()?;

        let shell_path = if let Some(s) = shell {
            s.to_string()
        } else {
            Self::get_default_shell()
        };

        let cwd_path = cwd.unwrap_or("~");

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

                let pts_name_ptr = libc::ptsname(slave_fd);
                if pts_name_ptr.is_null() {
                    libc::_exit(1);
                }

                let pts_name = std::ffi::CStr::from_ptr(pts_name_ptr);

                let fd = libc::open(pts_name.as_ptr(), libc::O_RDWR);
                if fd < 0 {
                    libc::_exit(1);
                }

                close(slave_fd);

                dup2(fd, 0);
                dup2(fd, 1);
                dup2(fd, 2);
                if fd > 2 {
                    close(fd);
                }

                if !cwd_path.is_empty() && cwd_path != "~" {
                    libc::chdir(cwd_path.as_ptr() as *const c_char);
                }

                libc::setenv(
                    b"TERM\0".as_ptr() as *const c_char,
                    b"xterm-256color\0".as_ptr() as *const c_char,
                    1,
                );

                let shell_cstr = std::ffi::CString::new(shell_path.as_str()).unwrap();
                let args = vec![shell_cstr.as_ptr(), std::ptr::null()];
                execvp(shell_cstr.as_ptr(), args.as_ptr());
                libc::_exit(1);
            }
        }

        unsafe {
            close(slave_fd);
        }

        let session_id = format!("pty-{}", Self::uuid_simple());

        {
            let mut sessions = self.sessions.lock();
            sessions.insert(
                session_id.clone(),
                PtySession {
                    master_fd,
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

        let file = unsafe { File::from_raw_fd(master_fd) };
        let mut writer = file;
        
        match writer.write_all(data.as_bytes()) {
            Ok(_) => {
                writer.flush().map_err(|e| format!("Flush error: {}", e))?;
                std::mem::forget(writer);
                Ok(())
            }
            Err(e) => Err(format!("Write error: {}", e)),
        }
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
        let master_fd = {
            let sessions = self.sessions.lock();
            match sessions.get(id) {
                Some(session) => session.master_fd,
                None => return,
            }
        };

        let id_clone = id.to_string();
        let app_clone = app.clone();

        thread::spawn(move || {
            let mut file = unsafe { File::from_raw_fd(master_fd) };
            let mut buf = [0u8; 8192];
            loop {
                match file.read(&mut buf) {
                    Ok(0) => {
                        std::mem::forget(file);
                        let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let output = PtyOutput {
                            id: id_clone.clone(),
                            data,
                        };
                        let _ = app_clone.emit(&format!("pty:data:{}", id_clone), output);
                    }
                    Err(e) => {
                        if e.kind() != std::io::ErrorKind::WouldBlock {
                            let output = PtyOutput {
                                id: id_clone.clone(),
                                data: format!("\r\n[Read error: {}]\r\n", e),
                            };
                            let _ = app_clone.emit(&format!("pty:data:{}", id_clone), output);
                        }
                        std::mem::forget(file);
                        break;
                    }
                }
            }
        });
    }

    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let master_fd = {
            let mut sessions = self.sessions.lock();
            match sessions.remove(id) {
                Some(session) => session.master_fd,
                None => return Err("Session not found".to_string()),
            }
        };

        unsafe {
            close(master_fd);
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
