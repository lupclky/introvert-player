---
name: multi-branch-workflow
description: Workflow để merge code vào các nhánh dtn, meo3k2 và emdua sau khi hoàn thiện tính năng.
---

# Multi-Branch Workflow (dtn, meo3k2, emdua)

Hệ thống Introvert Player hiện tại đang được phân tách thành 3 nhánh chính (main branches) dành cho các đối tượng khác nhau:
1. **`dtn`**: Dành cho Dương Thiếu Ngủ (bản rút gọn).
2. **`meo3k2`**: Dành cho mèo 3k (bản rút gọn).
3. **`emdua`**: Dành cho Em Dứa (bản đầy đủ tính năng / độc quyền).

## Quy trình làm việc (BẮT BUỘC)

Bất cứ khi nào bạn (Agent) vừa hoàn thành một tính năng (feature) hoặc sửa lỗi (bug fix) xong:
1. Bạn **phải chủ động nhắc nhở và hỏi User**:
   *"Tính năng này đã hoàn thiện. Bạn có muốn tôi tiến hành merge code mới này vào cả 3 nhánh chính là `dtn`, `meo3k2` và `emdua` không?"*
2. **Trường hợp ngoại lệ**:
   Nếu User đã nói rõ từ đầu rằng tính năng này là **dành riêng (custom)** cho 1 người cụ thể (ví dụ: "làm chức năng này cho dtn thôi"), thì bạn CHỈ merge code vào nhánh của người đó, và không cần hỏi merge vào các nhánh còn lại.
3. Khi thực hiện merge:
   - Hãy chắc chắn xử lý xung đột (conflict) nếu có.
   - Chú ý giữ nguyên các cấu hình định danh/branding riêng biệt của từng nhánh (VD: placeholder tên người gửi "mèo 3k", "Dương Thiếu Ngủ", "Em Dứa") nếu có merge nhầm.
   - Đảm bảo chắc chắn rồi commit cho cả 2 branch còn lại.
