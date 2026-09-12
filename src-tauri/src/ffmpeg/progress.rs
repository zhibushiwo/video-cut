//! `-progress pipe:1` 结构化进度解析（DESIGN §6.4）。
//!
//! 只解析 stdout 的 key=value 行，禁止解析 stderr 的 time= 行。

/// 单次进度更新（`progress=` 行触发）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ProgressUpdate {
    /// 已输出时长（秒）
    pub out_time_sec: Option<f64>,
    /// 编码速度（如 3.2 表示 3.2x）
    pub speed: Option<f64>,
    /// 进程是否报告结束（progress=end）
    pub done: bool,
}

/// 跨行累计的解析器。每个 ffmpeg 子进程一个实例。
#[derive(Debug, Default)]
pub struct ProgressParser {
    /// out_time_us / out_time_ms 均为微秒（out_time_ms 是历史兼容名，DESIGN §6.4）
    out_time_us: Option<f64>,
    speed: Option<f64>,
}

impl ProgressParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// 喂入一行输出；仅在 `progress=` 行返回更新。
    pub fn feed(&mut self, line: &str) -> Option<ProgressUpdate> {
        let line = line.trim();
        let (key, value) = line.split_once('=')?;
        let value = value.trim();
        match key {
            "out_time_us" => self.out_time_us = value.parse().ok(),
            "out_time_ms" => {
                if self.out_time_us.is_none() {
                    self.out_time_us = value.parse().ok();
                }
            }
            "speed" => {
                if let Some(s) = value.strip_suffix('x').and_then(|s| s.parse().ok()) {
                    self.speed = Some(s);
                }
            }
            "progress" => {
                return Some(ProgressUpdate {
                    out_time_sec: self.out_time_us.map(|us| us / 1_000_000.0),
                    speed: self.speed,
                    done: value == "end",
                });
            }
            _ => {}
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_block() {
        let mut p = ProgressParser::new();
        assert_eq!(p.feed("frame=1234"), None);
        assert_eq!(p.feed("fps=180.0"), None);
        assert_eq!(p.feed("out_time_us=41234000"), None);
        assert_eq!(p.feed("speed=3.2x"), None);

        let upd = p.feed("progress=continue").unwrap();
        assert!((upd.out_time_sec.unwrap() - 41.234).abs() < 1e-9);
        assert_eq!(upd.speed, Some(3.2));
        assert!(!upd.done);
    }

    #[test]
    fn detects_end() {
        let mut p = ProgressParser::new();
        p.feed("out_time_us=1000000");
        let upd = p.feed("progress=end").unwrap();
        assert!(upd.done);
        assert!((upd.out_time_sec.unwrap() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn out_time_ms_fallback_is_microseconds() {
        let mut p = ProgressParser::new();
        p.feed("out_time_ms=2500000");
        let upd = p.feed("progress=continue").unwrap();
        assert!((upd.out_time_sec.unwrap() - 2.5).abs() < 1e-9);
    }

    #[test]
    fn na_speed_keeps_previous_value() {
        let mut p = ProgressParser::new();
        p.feed("speed=2.0x");
        p.feed("progress=continue");
        p.feed("speed=N/A");
        let upd = p.feed("progress=continue").unwrap();
        assert_eq!(upd.speed, Some(2.0));
    }
}
