// 后端服务地址配置
// 体验版使用独立公网后端。微信后台 request 合法域名为 https://sparkye.cn。
// 凭据只在服务器；客户端用临时微信 code 换取会话，不携带 AppSecret 或模型密钥。
module.exports = {
  baseUrl: 'https://sparkye.cn/math-app',
  authRequired: true
}
