//! `-progress pipe:1` 结构化进度解析（DESIGN §6.4）。
//!
//! M1 落地：解析 out_time_us / speed / progress 行，禁止解析 stderr 的 time= 行。
