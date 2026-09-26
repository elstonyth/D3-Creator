/**
 * Chinese copy for the staff portal (staff.d3creator.com) and the admin
 * console's Work Tracker and Team pages. English source strings are the keys.
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
  'For the D3 team: your shoot schedule and your videos. New here? Create a staff account and an admin approves it.':
    '供 D3 团队使用：你的拍摄行程和视频。第一次来？注册员工账号，管理员审批后即可使用。',
  'Create your staff account': '注册员工账号',
  'Use your own email. An admin approves new accounts before you can use your Work Tracker.':
    '请使用你自己的邮箱。新账号需管理员审批后才能使用你的工作看板。',
  'If {email} is new, a confirmation link is on its way. Open it, and an admin approves your account before you can use your Work Tracker.':
    '如果 {email} 是新邮箱，确认链接已发出。打开链接后，管理员审批通过即可使用你的工作看板。',
  'D3 team portal. Creators and members sign in at':
    'D3 团队门户。创作者和会员请在此登录：',
  '{email} is already registered. If it is your staff account, sign in. If you use it for D3 classes or the Studio, sign up for staff with a different email.':
    '{email} 已注册。如果这是你的员工账号，请直接登录；如果它是你上 D3 课程或使用 Studio 的账号，请换一个邮箱注册员工账号。',

  // ---- A day's shoots ------------------------------------------------------
  Everyone: '全部人',
  'Nothing planned.': '暂无安排。',
  Done: '完成',
  Cancelled: '已取消',
  'Cancel shoot': '取消拍摄',
  'Cancel shoot: {title}': '取消拍摄：{title}',
  Reopen: '恢复',
  'Reopen {title}': '恢复 {title}',
  'Delete {title}': '删除 {title}',
  'Delete this shoot for good?': '确定永久删除这条拍摄？',
  Shoot: '拍摄',
  'Videos shot': '实际拍摄数',

  // ---- Shoot form ---------------------------------------------------------
  Person: '人员',
  'Choose…': '请选择…',
  Day: '日期',
  Time: '时间',
  'Creator account': '创作者账号',
  'No account': '不指定账号',
  Note: '备注',

  // ---- Shoot actions (server messages, shown through t()) ---------------
  'Pick a day.': '请选择日期。',
  'Time must look like 19:30.': '时间格式应为 19:30。',
  'Invalid account.': '账号无效。',
  'Invalid note.': '备注无效。',
  'Notes are limited to 1,000 characters.': '备注最多 1000 字。',
  'Invalid shoot.': '拍摄记录无效。',
  'That shoot is already gone.': '这条拍摄已被删除。',
  '{name} (left)': '{name}（已离职）',
  'Invalid status.': '状态无效。',

  // ---- Staff portal chrome and pages --------------------------------------
  'D3 Staff': 'D3 员工门户',
  'Your account is not linked to anyone yet.':
    '你的账号还没有关联到看板上的人员。',
  'An admin links each staff login to a person on the work board. Ask them to link yours on the Team page.':
    '管理员会把每个员工账号关联到工作看板上的人员。请让管理员在团队页为你关联。',
  'Almost there': '就快好了',
  'Waiting for an admin': '等待管理员审批',
  'Waiting for approval — D3 Staff': '等待审批 — D3 员工门户',
  'Your staff account is set up. An admin has to approve it and link it to your name on the work board before you can use your Work Tracker.':
    '你的员工账号已创建。管理员审批并关联到你在工作看板上的名字后，你才能使用你的工作看板。',
  'Tell your admin you have signed up. This page opens the portal once you are approved — just reload it.':
    '请告诉管理员你已注册。审批通过后刷新此页即可进入门户。',
  'Your name on the board': '你在看板上的名字',
  'How the team knows you, e.g. KEE.': '团队怎么称呼你，例如 KEE。',
  'Your job': '你的职位',
  'Handler — shoots and verifies videos': '负责人——负责拍摄和审核视频',
  'Editor — cuts videos': '剪辑——负责剪视频',
  'Both — shoots, edits and verifies': '两者都做——拍摄、剪辑和审核',

  // ---- Video jobs -------------------------------------------------------------
  'Show whose videos': '显示谁的视频',
  'Being edited': '剪辑中',
  'Done this month': '本月已完成',
  'Nothing finished yet this month.': '本月还没有完成的视频。',
  You: '你',
  'done {day}': '{day} 完成',
  'Edited video': '剪好的视频',
  editing: '剪辑中',
  'Link to the edited video': '剪好视频的链接',
  'Done editing: {title}': '完成剪辑：{title}',
  'Undo edit': '撤回剪辑完成',
  'Undo edit: {title}': '撤回剪辑完成：{title}',
  Change: '修改',
  'Change {title}': '修改「{title}」',
  'That video is not yours to change, or it has moved on.':
    '这条视频不归你改，或已进入下一步。',
  'Invalid video.': '视频无效。',
  'Say which video this is (up to 200 characters).':
    '请说明是哪条视频（最多 200 字）。',
  'Invalid person.': '人员无效。',

  // ---- History / profiles -----------------------------------------------------
  Month: '月份',
  'Shoots done': '已完成拍摄',
  '{planned} still planned · {cancelled} cancelled':
    '{planned} 个待拍 · {cancelled} 个已取消',
  Shoots: '拍摄',
  'No shoots this month.': '本月没有拍摄。',
  Planned: '计划中',
  handler: '负责人',
  editor: '剪辑',
  'handler & editor': '负责人兼剪辑',
  'Videos done': '已完成的视频',
  Edited: '已剪辑',
  'No edits marked done this month.': '本月没有标记完成的剪辑。',
  'Profile — D3 Admin': '人员资料 — D3 管理后台',
  'Left the board': '已离开看板',
  'No login yet': '尚无登录账号',

  // ---- Admin: team ----------------------------------------------------------------
  Team: '团队',
  'Team — D3 Admin': '团队 — D3 管理后台',
  'The team': '团队成员',
  'Approve staff who signed up, and see what each person has done this month.':
    '审批注册的员工，并查看每个人本月的工作量。',
  'Waiting for approval': '等待审批',
  'Nobody is waiting. New staff sign up at staff.d3creator.com.':
    '没有待审批的人。新员工在 staff.d3creator.com 注册。',
  'Signed up {when} as “{name}”, {job}.':
    '{when} 注册，名字「{name}」，职位：{job}。',
  'Approve as': '审批为',
  'New person': '新人员',
  'Someone already on the board': '看板上已有的人员',
  'Name on the board': '看板上的名字',
  Job: '职位',
  'Turn away': '拒绝',
  'Turn this signup away? The login stays but reaches nothing.':
    '拒绝这个注册？账号会保留，但无法访问任何内容。',
  'This month so far. Open a profile for the videos, links and shoots behind the numbers.':
    '本月至今。打开人员资料可查看数字背后的视频、链接和拍摄。',
  'Open profile': '查看资料',
  'Approved. They can sign in now.': '已批准，现在可以登录了。',
  'Turned away.': '已拒绝。',
  'Job: {name}': '职位：{name}',
  'Job saved.': '职位已保存。',
  'That person is no longer on the board.': '此人已不在看板上。',
  'That account is not waiting for approval.': '这个账号不在待审批状态。',
  'That person already has a login, or is no longer on the board.':
    '此人已有登录账号，或已不在看板上。',
  'Name is required (max 40 chars).': '请填写名字（最多 40 字）。',
  'Invalid person type.': '人员类型无效。',
  'That login is already linked to someone.': '这个账号已关联到其他人。',
  'They have not confirmed their email yet.': '对方还没有确认邮箱。',
  'Approved before, but not linked to anyone yet.':
    '之前已批准，但还没有关联到任何人。',
  'Their email is not confirmed yet. Approve once they open the link we sent.':
    '对方的邮箱还没有确认。等对方打开确认邮件后再审批。',
  'Could not finish approving. Try again.': '审批未完成，请再试一次。',
  Verified: '已审核',
  'Passed on to the editors': '已交给剪辑',
  'Take {name} off the team? Their staff login stops working. Their shoots and videos stay in the record; videos they passed on that are not verified yet can no longer be verified.':
    '要将 {name} 移出团队吗？其员工登录将失效，拍摄和视频会保留在记录中；其交出但尚未审核的视频将无法再审核。',
  'Removed from the team.': '已移出团队。',

  // ---- Video job notices ------------------------------------------------------
  'Taken back: “{title}”.': '已撤回：“{title}”。',

  // ---- Staff sign-up: no job picked for them
  'Choose your job': '请选择职位',
  'Choose your job.': '请选择你的职位。',

  // ---- Waiting page
  Refresh: '刷新',

  // ---- Staff video flow: shoots passed on, edited, verified ----------------
  'Pass videos': '交出视频',
  'Pass videos: {title}': '交出视频：{title}',
  '{count} videos passed': '已交出 {count} 条视频',
  'Delete this shoot for good? The videos passed on from it stay.':
    '确定永久删除这条拍摄？已交出的视频会保留。',
  'Nobody on the team edits videos yet. Ask an admin to set someone’s job to Editor.':
    '团队里还没有剪辑人员。请管理员把某人的职位设为剪辑。',
  'One row per video: its title, and who edits it.':
    '每条视频一行：填写标题，并选择由谁剪辑。',
  'Video {n} title': '第 {n} 条视频标题',
  'Video {n} editor': '第 {n} 条视频的剪辑',
  'Video title': '视频标题',
  'Editor…': '剪辑…',
  'Remove video {n}': '移除第 {n} 条视频',
  '+ Add video': '+ 添加视频',
  'To edit': '待剪辑',
  'To verify': '待审核',
  'With the editor': '剪辑中（我交出的）',
  'Waiting to verify': '待审核',
  'Verified this month': '本月已审核',
  'Nothing is being edited.': '没有正在剪辑的视频。',
  'Nothing is waiting to be verified.': '没有待审核的视频。',
  'Nothing verified yet this month.': '本月还没有审核通过的视频。',
  'Nothing to edit right now.': '目前没有要剪辑的视频。',
  'Nothing to verify right now.': '目前没有要审核的视频。',
  'Nothing waiting on an editor.': '没有在等剪辑的视频。',
  'verified {day}': '{day} 已审核',
  Verify: '审核通过',
  'Verify: {title}': '审核通过：{title}',
  'Undo verify': '撤回审核',
  'Undo verify: {title}': '撤回审核：{title}',
  'Remove {title}': '移除 {title}',
  'Remove this video? It leaves the editor’s list too.':
    '移除这条视频？剪辑的列表里也会一并移除。',
  'Edit done: “{title}” is waiting to be verified.':
    '剪辑完成：“{title}” 正在等待审核。',
  'Verified: “{title}”.': '已审核：“{title}”。',
  'Removed: “{title}”.': '已移除：“{title}”。',
  'Edit a video, then click Done. Videos you passed on come back here to verify once their editor is done.':
    '剪好视频后点「完成」。你交出的视频在剪辑完成后会回到这里，等你审核。',
  'Who is editing each video now, and who verifies it next. Staff pass videos on from their shoots; each Done and Verify counts toward their month.':
    '每条视频现在由谁剪辑、接下来由谁审核。员工从拍摄交出视频；每次「完成」和「审核通过」都计入当月工作量。',
  'That shoot is not yours to change, or it has moved on.':
    '这条拍摄不归你改，或状态已变更。',
  'Shoots before this month are closed.': '本月以前的拍摄已结算。',
  'You can only pass videos from your own shoots.':
    '只能交出你自己拍摄的视频。',
  'That shoot was cancelled. Reopen it first.': '这条拍摄已取消，请先恢复。',
  'Add between 1 and 30 videos.': '请添加 1 到 30 条视频。',
  'Give each video a title (up to 200 characters).':
    '请为每条视频填写标题（最多 200 字）。',
  'Pick an editor for each video.': '请为每条视频选择剪辑。',
  'Pick an editor who is on the team.': '请选择仍在团队中的剪辑。',
  'You are no longer on the team.': '你已不在团队中。',
  'Pick an editor.': '请选择剪辑。',
  'That link does not look right. Paste one starting with https://, or leave it empty.':
    '链接格式不对。请贴上以 https:// 开头的链接，或留空。',
  'You can only take back your own Done from this month, before it is verified.':
    '只能在审核前撤回你自己本月的「完成」。',
  'You can only take back your own Verify from this month.':
    '只能撤回你自己本月的「审核通过」。',

  // ---- Work trackers (staff home, admin /tracker) ---------------------------
  'Work Tracker': '工作看板',
  'Work Tracker — D3 Staff': '工作看板 — D3 员工门户',
  'Work Tracker — D3 Admin': '工作看板 — D3 管理后台',
  Work: '工作',
  Tracker: '看板',
  'Admin console': '管理控制台',
  Upcoming: '近期',
  Tomorrow: '明天',
  '+{count} more': '还有 {count} 项',
  Calendar: '日历',
  Sun: '日',
  Mon: '一',
  Tue: '二',
  Wed: '三',
  Thu: '四',
  Fri: '五',
  Sat: '六',
  '{count} items': '{count} 项',
  'Shoots for': '当日拍摄',
  '+ Add a shoot': '+ 添加拍摄',
  'This month': '本月',
  'Videos passed': '已交出视频',
  'My videos': '我的视频',
  'Your shoots, the videos you passed on, and what is waiting for you.':
    '你的拍摄、你交出的视频，以及等你处理的工作。',
  '{edit} to edit · {verify} to verify': '{edit} 条待剪辑 · {verify} 条待审核',
  'Everyone’s shoots and videos as staff update them.':
    '全体员工的拍摄和视频，随员工更新同步显示。',
  '{editing} being edited · {waiting} waiting to verify':
    '{editing} 条剪辑中 · {waiting} 条待审核',
  'Team this month': '团队本月',
  'Team · {month}': '团队 · {month}',
  'What each person is editing now and what waits on their check. Numbers are for {month}.':
    '每个人正在剪辑的视频和等他们审核的视频。数字统计月份：{month}。',
  'Editing now': '正在剪辑',
  'Nothing in their hands.': '手上没有视频。',
  'Nothing waiting on them.': '没有等他们审核的视频。',
  'not verified yet': '尚未审核',

  // ---- Admin tracker: the account board ---------------------------------------
  'Personnel & client configuration': '人员与客户分配',
  'Who handles and who edits each account, updated as staff pass their videos on. Output is for {month}.':
    '每个账号由谁负责、谁剪辑，随员工交出视频自动更新。数据统计月份：{month}。',
  'No accounts yet.': '还没有账号。',
  'Videos = different videos posted in {month}. The same clip on several platforms counts once.':
    '视频数 = {month} 发布的不同视频数量；同一条视频发在多个平台只算一次。',
  Unassigned: '未分配',
  '{name}’s accounts': '{name} 的账号',
  'Unassigned accounts': '未分配的账号',
  Editors: '剪辑人员',
  'No editors yet.': '还没有剪辑人员。',
  'Edits {count} accounts · {videos} videos':
    '剪辑 {count} 个账号 · {videos} 条视频',
  'Edits 1 account · {videos} videos': '剪辑 1 个账号 · {videos} 条视频',
  'Every account has a handler.': '所有账号都已分配负责人。',
  '{views} views · {posts} posts': '{views} 播放 · {posts} 条发布',
  Nobody: '无',
};
