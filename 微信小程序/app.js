// app.js
App({
  onLaunch() { require('./utils/photo-assets').cleanup() },
  globalData: {
    lastResult: null, // 解析结果跨页传递
    pendingPhoto: null, // 拍照识别的题干与作答跨页传递
    lastWrongAnswer: '', // 与 lastResult 同步传递，读取后清空
    lastQuestionDoc:null,lastWrongAnswerDoc:null,lastSourceImage:null
  }
})
