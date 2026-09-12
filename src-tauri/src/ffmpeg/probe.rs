//! ffprobe 封装：媒体信息 JSON 解析与关键帧扫描（DESIGN §6.5）。
//!
//! M1 落地：`probe_media` → MediaInfo；`list_keyframes` → Vec<f64>（秒，升序）。
