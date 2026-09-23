/**
 * Chinese copy for the staff portal (staff.d3creator.com) and the admin
 * console's Schedule and Team pages. English source strings are the keys.
 */
export const staffZh: Readonly<Record<string, string>> = {
  // ---- Users page --------------------------------------------------------
  Staff: '员工',
  'Staff, waiting': '员工（待审批）',
  'Manage on Team': '在团队页管理',
  'The staff portal on staff.d3creator.com. Approved on the Team page.':
    'staff.d3creator.com 员工门户，在团队页审批。',

  // ---- Sign-in / sign-up on staff.d3creator.com ----------------------------
  'Staff sign in — D3 Creator': '员工登录 — D3 Creator',
  'Staff sign up — D3 Creator': '员工注册 — D3 Creator',
  'Sign in to D3 Staff': '登录 D3 员工门户',
  'For the D3 team: your shoot schedule and your accounts. New here? Create a staff account and an admin approves it.':
    '供 D3 团队使用：你的拍摄行程和负责的账号。第一次来？注册员工账号，管理员审批后即可使用。',
  'Create your staff account': '注册员工账号',
  'Use your own email. An admin approves new accounts before you see the team’s schedule.':
    '请使用你自己的邮箱。新账号需管理员审批后才能查看团队行程。',
  'If {email} is new, a confirmation link is on its way. Open it, and an admin approves your account before you see the team’s work.':
    '如果 {email} 是新邮箱，确认链接已发出。打开链接后，管理员审批通过即可查看团队工作。',
  'D3 team portal. Creators and members sign in at': 'D3 团队门户。创作者和会员请在此登录：',

  // ---- Week schedule ------------------------------------------------------
  'Previous week': '上一周',
  'Next week': '下一周',
  'This week': '本周',
  'Show whose shoots': '显示谁的行程',
  Everyone: '全部人',
  Mine: '我的',
  'Nothing planned.': '暂无安排。',
  '+ Add': '+ 添加',
  'Add a shoot on {day}': '在{day}添加拍摄',
  '{count} videos planned': '计划 {count} 条视频',
  Done: '已完成',
  'Done · {count} videos': '已完成 · {count} 条视频',
  Cancelled: '已取消',
  Edit: '编辑',
  'Edit {title}': '编辑 {title}',
  'Mark {title} done': '标记 {title} 为已完成',
  'Cancel shoot': '取消拍摄',
  'Cancel {title}': '取消 {title}',
  Reopen: '恢复',
  'Reopen {title}': '恢复 {title}',
  'Delete {title}': '删除 {title}',
  'Delete this shoot for good?': '确定永久删除这条拍摄？',
  'Videos shot': '实际拍摄数',
  'Mark done': '标记完成',

  // ---- Shoot form ---------------------------------------------------------
  Person: '人员',
  'Choose…': '请选择…',
  Day: '日期',
  Time: '时间',
  'Where / what': '地点 / 内容',
  'e.g. Hotpot shop, JB': '例如：火锅店，新山',
  'Creator account': '创作者账号',
  'No account': '不指定账号',
  Note: '备注',

  // ---- Shoot actions (server messages, shown through t()) ---------------
  'Pick a day.': '请选择日期。',
  'Time must look like 19:30.': '时间格式应为 19:30。',
  'Say where or what you are shooting (up to 200 characters).':
    '请填写拍摄地点或内容（最多 200 字）。',
  'Invalid account.': '账号无效。',
  'Videos must be a whole number from 0 to 99.': '视频数必须是 0 到 99 的整数。',
  'Invalid note.': '备注无效。',
  'Notes are limited to 1,000 characters.': '备注最多 1000 字。',
  'Invalid shoot.': '拍摄记录无效。',
  'Pick a person.': '请选择人员。',
  'That person is not on the board.': '此人不在看板上。',
  'That shoot is not yours, or it is already gone.':
    '这条拍摄不是你的，或已被删除。',
  'Invalid status.': '状态无效。',
};
