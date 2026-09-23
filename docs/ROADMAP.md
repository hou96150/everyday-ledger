# 下一步 / Roadmap

已完成手動 JSON 完整備份與空白帳本還原，見 [備份指南](BACKUP.md)。排程備份仍待做。

Manual JSON backup and empty-ledger restore are available; scheduled backups remain planned.

這是方向，不是交付日期承諾。/ These are priorities, not delivery-date commitments.

| 優先 / Priority         | 工作 / Work                                                               | 完成條件 / Acceptance                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                       | 定期備份與還原 / Scheduled backup and restore                             | 可重建帳目、庫存及歷史；排程有失敗通知，且演練還原與損壞檔案拒絕 / Rebuild records, stock and history; alert on failed backups and test restoration and corrupt-file rejection          |
| 2                       | 容量與同步提醒 / Capacity and sync alerts                                 | 顯示雲端容量與待同步筆數；接近額度、同步持續失敗或裝置長時間未同步時提醒 / Show cloud usage and pending operations; alert on approaching quota, sustained sync failure or stale devices |
| 3                       | 帳號維護 / Account maintenance                                            | 安全修改密碼與管理者重設，資料歸屬不變 / Safe password changes and admin reset without changing record ownership                                                                        |
| 4                       | 兩台實際裝置驗收 / Two-device shop acceptance                             | 斷網、恢復、重送、衝突與登出都有紀錄 / Document disconnect, reconnect, retries, conflicts and logout                                                                                    |
| 5                       | 鍵盤與輔助使用 / Accessibility                                            | 對話框焦點、鍵盤操作、螢幕閱讀器逐項檢查 / Verify dialog focus, keyboard operation and screen-reader flows                                                                              |
| 6                       | 相依維護 / Dependency maintenance                                         | 修正通報且保持匯出格式及測試通過 / Resolve advisories while retaining workbook behavior and tests                                                                                       |
| 待需求 / Needs evidence | 多語介面、更多店面、個人角色 / Localization, more shops, individual roles | 先確認真實使用需求與資料遷移策略 / Establish real demand and a data migration strategy                                                                                                  |

目前不承諾支付、發票、法定會計或完整 POS。/ Payments, invoices, statutory accounting and a full POS are not committed scope.
