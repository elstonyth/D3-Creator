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
  'D3 team portal. Creators and members sign in at':
    'D3 团队门户。创作者和会员请在此登录：',
  '{email} is already registered. If it is your staff account, sign in. If you use it for D3 classes or the Studio, sign up for staff with a different email.':
    '{email} 已注册。如果这是你的员工账号，请直接登录；如果它是你上 D3 课程或使用 Studio 的账号，请换一个邮箱注册员工账号。',

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
  Done: '完成',
  'Done · {count} videos': '已完成 · {count} 条视频',
  Cancelled: '已取消',
  Edit: '编辑',
  'Edit {title}': '编辑 {title}',
  'Done: {title}': '完成：{title}',
  'Cancel shoot': '取消拍摄',
  'Cancel shoot: {title}': '取消拍摄：{title}',
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
  'Videos must be a whole number from 0 to 99.':
    '视频数必须是 0 到 99 的整数。',
  'Invalid note.': '备注无效。',
  'Notes are limited to 1,000 characters.': '备注最多 1000 字。',
  'Invalid shoot.': '拍摄记录无效。',
  'Pick a person.': '请选择人员。',
  'That person is not on the board.': '此人不在看板上。',
  'You can only change your own shoots, from this month on. Ask an admin.':
    '只能修改你自己本月起的拍摄。更早的请找管理员。',
  'That shoot is already gone.': '这条拍摄已被删除。',
  'Shoots before this month are closed. Ask an admin.':
    '本月以前的拍摄已结算，请找管理员。',
  '{name} (left)': '{name}（已离开）',
  'Invalid status.': '状态无效。',

  // ---- Staff portal chrome and pages --------------------------------------
  'D3 Staff': 'D3 员工门户',
  'My work': '我的工作',
  'My work — D3 Staff': '我的工作 — D3 员工门户',
  Schedule: '行程',
  'Schedule — D3 Staff': '行程 — D3 员工门户',
  'Shoot schedule': '拍摄行程',
  'My accounts': '我的账号',
  'My accounts — D3 Staff': '我的账号 — D3 员工门户',
  History: '记录',
  'History — D3 Staff': '记录 — D3 员工门户',
  'Hi, {name}': '你好，{name}',
  'What the admin gave you. When your part of a video is finished, click Done and paste the link — the admin sees it straight away.':
    '管理员交给你的工作。你负责的部分完成后，点「完成」并贴上链接——管理员马上就能看到。',
  'When and where everyone is shooting this week. Add yours — the team and the admin see it straight away.':
    '本周每个人在哪里、几点拍摄。加上你的行程——团队和管理员马上就能看到。',
  'What you look after': '你负责的账号',
  'Output for {month}, from the scraped posts.':
    '{month} 的数据，来自抓取的帖子。',
  'Your record': '你的工作记录',
  'Every shoot you logged, the videos that came out of them, and the accounts you held that month.':
    '你记录的每次拍摄、产出的视频，以及当月负责的账号。',
  'Your account is not linked to anyone yet.':
    '你的账号还没有关联到看板上的人员。',
  'An admin links each staff login to a person on the work board. Ask them to link yours on the Team page.':
    '管理员会把每个员工账号关联到工作看板上的人员。请让管理员在团队页为你关联。',
  'Almost there': '就快好了',
  'Waiting for an admin': '等待管理员审批',
  'Waiting for approval — D3 Staff': '等待审批 — D3 员工门户',
  'Your staff account is set up. An admin has to approve it and link it to your name on the work board before you can see the team’s schedule.':
    '你的员工账号已创建。管理员审批并关联到你在工作看板上的名字后，你才能看到团队行程。',
  'Tell your admin you have signed up. This page opens the portal once you are approved — just reload it.':
    '请告诉管理员你已注册。审批通过后重新载入此页即可进入门户。',
  'Your name on the board': '你在看板上的名字',
  'How the team knows you, e.g. KEE.': '团队怎么称呼你，例如 KEE。',
  'Your job': '你的职位',
  'Handler — runs accounts': '负责人——负责运营账号',
  'Editor — cuts videos': '剪辑——负责剪视频',
  'Both — runs accounts and cuts videos': '两者都做——运营账号也剪视频',

  // ---- Tasks ----------------------------------------------------------------
  'Tasks from the admin': '管理员交代的任务',
  'No tasks for you right now.': '目前没有你的任务。',
  'Give {title} to': '把「{title}」交给',
  'Not given to anyone': '未指派',
  'For: {name}': '交给：{name}',
  'That task is not yours, or it is gone.': '这个任务不是你的，或已被删除。',
  'That task is gone.': '这个任务已被删除。',
  'Invalid task.': '任务无效。',

  // ---- Video jobs -------------------------------------------------------------
  'Video jobs': '视频工作',
  'Videos — D3 Admin': '视频 — D3 管理后台',
  'Give a video to an account’s editor and handler. Each clicks Done with a link when their part is finished, and it counts toward their month.':
    '把视频交给账号的剪辑和负责人。各自完成后点「完成」并贴上链接，计入当月工作量。',
  '+ New video': '+ 新视频',
  'Show whose videos': '显示谁的视频',
  'Being edited': '剪辑中',
  'Ready to post': '待发布',
  'Done this month': '本月已完成',
  'Nothing waiting on an edit.': '没有待剪辑的视频。',
  'Nothing waiting to go out.': '没有待发布的视频。',
  'Nothing finished yet this month.': '本月还没有完成的视频。',
  'Which video': '哪条视频',
  'e.g. CNY promo, reel 2': '例如：新年宣传片第 2 条',
  'Posting day': '发布日期',
  You: '你',
  'done {day}': '{day} 完成',
  'Edited video': '剪好的视频',
  editing: '剪辑中',
  'posted {day}': '{day} 已发布',
  'Live post': '已发布的帖子',
  'goes out {day}': '{day} 发布',
  'not scheduled': '未排期',
  'Link to the edited video': '剪好视频的链接',
  'Link to the live post': '已发布帖子的链接',
  'Delete this video job for good?': '确定永久删除这条视频工作？',
  'Done editing: {title}': '完成剪辑：{title}',
  'Undo edit': '撤回剪辑完成',
  'Undo edit: {title}': '撤回剪辑完成：{title}',
  'Schedule post': '排期',
  'Schedule post: {title}': '排期：{title}',
  Reschedule: '改期',
  'Reschedule: {title}': '改期：{title}',
  'Done posting: {title}': '完成发布：{title}',
  'Undo post: {title}': '撤回发布：{title}',
  Undo: '撤回',
  Change: '修改',
  'Change {title}': '修改「{title}」',
  'That video is not yours to change, or it has moved on.':
    '这条视频不归你改，或已进入下一步。',
  'Only an admin can do that.': '只有管理员可以这样做。',
  'You can only take back your own Done from this month. Ask an admin.':
    '只能撤回你自己本月的「完成」。更早的请找管理员。',
  'Paste the link to the edited video (starting with https://).':
    '请贴上剪好视频的链接（以 https:// 开头）。',
  'Paste the link to the live post (starting with https://).':
    '请贴上已发布帖子的链接（以 https:// 开头）。',
  'Pick a posting day.': '请选择发布日期。',
  'A posting time needs a day.': '填写发布时间前请先选日期。',
  'Invalid video.': '视频无效。',
  'That video is already gone.': '这条视频已被删除。',
  'Pick the account the video is for.': '请选择视频所属的账号。',
  'Say which video this is (up to 200 characters).':
    '请说明是哪条视频（最多 200 字）。',
  'Give the video to an editor or a handler.': '请把视频交给一位剪辑或负责人。',
  'Invalid person.': '人员无效。',

  // ---- History / profiles -----------------------------------------------------
  Month: '月份',
  'Shoots done': '已完成拍摄',
  '{planned} still planned · {cancelled} cancelled':
    '{planned} 个待拍 · {cancelled} 个已取消',
  'From shoots marked done': '来自已完成的拍摄',
  'Accounts handled': '负责的账号',
  'Accounts edited': '剪辑的账号',
  '{videos} videos · {views} views': '{videos} 条视频 · {views} 播放',
  '{accounts} accounts · {videos} videos · {views} views':
    '{accounts} 个账号 · {videos} 条视频 · {views} 播放',
  'No accounts handled this month.': '本月没有负责的账号。',
  'No accounts edited this month.': '本月没有剪辑的账号。',
  Shoots: '拍摄',
  'No shoots this month.': '本月没有拍摄。',
  Planned: '计划中',
  Handovers: '账号交接',
  'Accounts given to or taken from this person during the month.':
    '本月交给此人或从此人手上转走的账号。',
  'No handovers this month.': '本月没有交接。',
  handler: '负责人',
  editor: '剪辑',
  'handler & editor': '负责人兼剪辑',
  nobody: '无人',
  '{role}: {from} → {to}': '{role}：{from} → {to}',
  'Videos done': '已完成的视频',
  Edited: '已剪辑',
  Posted: '已发布',
  'No edits marked done this month.': '本月没有标记完成的剪辑。',
  'No posts marked done this month.': '本月没有标记完成的发布。',
  'Profile — D3 Admin': '人员资料 — D3 管理后台',
  'Left the board': '已离开看板',
  'No login yet': '尚无登录账号',

  // ---- Admin: schedule, team ----------------------------------------------------
  'Schedule — D3 Admin': '行程 — D3 管理后台',
  'When and where the team is shooting. Staff fill in their own; you can add or change anyone’s.':
    '团队在哪里、几点拍摄。员工自己填写；你可以添加或修改任何人的行程。',
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
  Row: '所在行',
  'Turn away': '拒绝',
  'Turn this signup away? The login stays but reaches nothing.':
    '拒绝这个注册？账号会保留，但无法访问任何内容。',
  'This month so far. Open a profile for the videos, links and shoots behind the numbers.':
    '本月至今。打开人员资料可查看数字背后的视频、链接和拍摄。',
  'Open profile': '查看资料',
  'Remove login': '移除登录',
  'Remove login: {name}': '移除登录：{name}',
  'Take away {name}’s login': '移除 {name} 的登录',
  '{name} keeps their place and history, but can no longer sign in to the staff portal.':
    '{name} 仍保留在看板上和工作记录中，但无法再登录员工门户。',
  'Approved. They can sign in now.': '已批准，现在可以登录了。',
  'Turned away.': '已拒绝。',
  'Login removed.': '已移除登录。',
  'Job: {name}': '职位：{name}',
  'Job saved.': '职位已保存。',
  'Job saved. Their accounts moved to Unassigned.':
    '职位已保存。其负责的账号已移至“未分配”。',
  'That person is no longer on the board.': '此人已不在看板上。',
  'That account is not waiting for approval.': '这个账号不在待审批状态。',
  'That person already has a login, or is no longer on the board.':
    '此人已有登录账号，或已不在看板上。',
  'Name is required (max 40 chars).': '请填写名字（最多 40 字）。',
  'Invalid person type.': '人员类型无效。',
  'That person has no login.': '此人没有登录账号。',
  'That login is already linked to someone.': '这个账号已关联到其他人。',
  'They have not confirmed their email yet.': '对方还没有确认邮箱。',
  'Approved before, but not linked to anyone yet.':
    '之前已批准，但还没有关联到任何人。',
  'Their email is not confirmed yet. Approve once they open the link we sent.':
    '对方的邮箱还没有确认。等对方打开确认邮件后再审批。',
  'Could not finish approving. Try again.': '审批未完成，请再试一次。',

  // ---- Tracker calendar -------------------------------------------------------
  Shoot: '拍摄',
  Post: '发布',
  'Going out': '当天发布',
  '{count} items': '{count} 项',

  // ---- Video job notices ------------------------------------------------------
  'Edit done: “{title}” is ready to post.':
    '剪辑完成：“{title}” 已移到「待发布」。',
  'Posted: “{title}”.': '已发布：“{title}”。',
  'Posting day saved for “{title}”.': '已保存“{title}”的发布日期。',
  'Taken back: “{title}”.': '已撤回：“{title}”。',

  // ---- A finished job or shoot, apart from the Done button that finishes it
  Finished: '已完成',

  // ---- Staff sign-up: no job picked for them
  'Choose your job': '请选择职位',
  'Choose your job.': '请选择你的职位。',

  // ---- Waiting page
  Refresh: '刷新',
};
