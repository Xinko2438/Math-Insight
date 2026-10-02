// 后端服务地址配置
// 本地开发：保持 localhost，并在微信开发者工具勾选「不校验合法域名」
// 真机预览：改为电脑局域网 IP，如 http://192.168.1.100:3000（手机与电脑需同一 WiFi）
// 正式上线：改为已备案的 HTTPS 域名，并在小程序后台配置 request 合法域名
module.exports = {
  baseUrl: 'http://localhost:3000'
}
