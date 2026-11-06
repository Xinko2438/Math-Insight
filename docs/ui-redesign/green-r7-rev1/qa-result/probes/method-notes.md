# 采集与校验方法记录

本轮复用R6 student.js、contrast.js的DOM与逐层sRGB方法，以及R5右侧命中/阅读锚点检查；只改R7选择器和受测上下文。使用内置隔离浏览器，无服务、数据库、安装、外部模型或用户窗口。

| 症状/限制 | 证据与原因 | 采取的动作/结果 |
| --- | --- | --- |
| 大对象返回被截断 | 原始JSON为106822字符，整对象返回含截断提示，不能解析 | 以7000字符分段，按总长度拼接再JSON.parse；完整保存。 |
| 大JSON经命令行保存报206 | 大字符串超过Windows进程命令长度；未写入目标 | 改用补丁文件接口直接保存；未重跑页面。 |
| 初次375点击没有变化 | 按钮处于内框之外；返回success不能证明展开 | 原始失败动作保留为375-expanded-native-click；下滚134后实际点击，再完成开/关/再开。仅后者计入通过。 |
| 首次外部校验误报序号 | PowerShell数组的Rank为维数1，屏蔽成员逐项投影 | 显式逐行读取rank；原始DOM未改，得到1–8。 |
| 旧Windows PowerShell读取JSON乱码 | 无BOM UTF8被按默认ANSI读；JSON文件本身可被当前PowerShell7.6.9正确解析 | 显式-Encoding UTF8；取消嵌套shell变量展开，单shell调用validate.ps1，退出0。 |
| S50容易被误读为50记录 | 源fixtureStats的S0/S50均为makeStats([])，S50只代表完整库 | 初探宽泛not-library-catalog不作充分证明；追加两宽S50和默认zero的严格0/0、空列表检查，4项通过。 |

截图保留原PNG（375为1280×720宿主、390为1280×844 fullPage），不改图。图集仅在显示时截出手机左侧375/390宽和667/844高；手机尺寸、字号与滚动仍查DOM。冻结三张390原图也逐张目视核验，无底部背景替代导航。

图集检查首次标签含中文，被浏览器拒绝；该轮后续元素动作无效，未当作验证。取消内部标签后重新打开并先取实际页面，9张资源全部加载、上一张/下一张实际切换成功，见gallery-check.json。报告聊天附件被明确拒绝（应用数据目录不能添加附件）；未越过唯一QA写入边界另存副本，交接保留可直接读取的绝对路径。

presentation-initial.json中screen.top字段记录的是scrollTop；几何位置请用target.json的screen.box.top。初探102个布尔检查和244条取样不是102/244个独立业务用例。最终10项结论由evidence.json单一caseLedger给出。

可重建入口：在冻结ui/index.html?shot=1中依次执行presentation.js、target.js；随后通过浏览器实际滚动/点击补足target.js的capture记录；shared-anchor.js只做两宽单例。分段导出对象后运行probes/validate.ps1。后续版本须重新绑定源哈希，不沿用本轮PASS。收尾指导源与既有任务相同，未证明额外知识读取带来改善；不宣称新增全局规则或长期复利收益。

