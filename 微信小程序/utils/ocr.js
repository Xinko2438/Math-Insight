const { request } = require('./request')
const { baseUrl } = require('./config')
const math = require('./math-document')
const photos = require('./photo-assets')

const reviewMessages = {
  unclear_text: '有文字看不清，请对照照片补全。',
  ambiguous_layout: '部分题干和作答的归属不明确，请核对。',
  question_not_found: '照片中未找到完整题干，请补充题目。',
  unsupported_characters: '部分符号需要核对，请对照照片确认。',
  needs_confirmation: '请对照照片核对识别内容。'
}

function normalizePhoto(data) {
  let questionDoc,wrongAnswerDoc
  let futureSource
  if(data&&(data.questionDoc||data.wrongAnswerDoc)&&(data.questionDoc?.version!==1||data.wrongAnswerDoc?.version!==1)&&typeof data.question==='string'&&typeof data.wrongAnswer==='string'){
    futureSource={questionDoc:data.questionDoc,wrongAnswerDoc:data.wrongAnswerDoc};data={question:data.question,wrongAnswer:data.wrongAnswer,needsReview:true,reviewReasons:['needs_confirmation']}
  }
  if(data && (data.questionDoc || data.wrongAnswerDoc)){
    try{questionDoc=math.validateDoc(data.questionDoc,2000);wrongAnswerDoc=math.validateDoc(data.wrongAnswerDoc,1000)}catch(_){throw Error('识别的数学结构不完整，请重试或手动输入。')}
    data={...data,question:math.toText(questionDoc),wrongAnswer:math.toText(wrongAnswerDoc)}
  }
  // The running server may still return its previous text-only contract.
  if (data && !Object.prototype.hasOwnProperty.call(data, 'question') && typeof data.text === 'string' && data.text.trim() && data.text.length <= 2000) {
    return { question: data.text.trim(), wrongAnswer: '', needsReview: true, reviewReasons: ['请核对识别文字，并补充照片中的作答。'] }
  }
  if (!data || typeof data.question !== 'string' || typeof data.wrongAnswer !== 'string' || typeof data.needsReview !== 'boolean' || !Array.isArray(data.reviewReasons) || data.reviewReasons.some(reason => typeof reason !== 'string')) throw Error('识别结果不完整，请重试或手动输入。')
  if (data.question.length > (questionDoc?4000:2000) || data.wrongAnswer.length > (wrongAnswerDoc?2000:1000)) throw Error('识别内容过长，请裁剪为一道题后重试。')
  const question = data.question.trim()
  const wrongAnswer = data.wrongAnswer.trim()
  if (!question && !wrongAnswer) throw Error('没有识别到题目或作答，请重新选择照片。')
  const reasons = [...new Set(data.reviewReasons.map(reason => reviewMessages[reason] || reviewMessages.needs_confirmation))]
  if(futureSource)reasons.push('数学结构版本暂不支持，已保留原文供修改。')
  if (!question && !reasons.includes(reviewMessages.question_not_found)) reasons.push(reviewMessages.question_not_found)
  if (data.needsReview && !reasons.length) reasons.push(reviewMessages.needs_confirmation)
  return { question, wrongAnswer, needsReview: data.needsReview || reasons.length > 0, reviewReasons: reasons,...(questionDoc?{questionDoc,wrongAnswerDoc}:{}),sourceTranscription:{question,wrongAnswer,...(futureSource||{}),...(questionDoc?{questionDoc:math.clone(questionDoc),wrongAnswerDoc:math.clone(wrongAnswerDoc)}:{})} }
}

// One operation for both recording paths. No upload before photo selection.
function recognizeQuestion({ onStart, onFinish, onSuccess, onError }) {
  let finished = false
  let selectedPath = ''
  const finish = () => {
    if (finished) return
    finished = true
    wx.hideLoading()
    onFinish()
  }
  const fail = message => { finish(); onError(message) }
  const upload = image => request({
    url: `${baseUrl}/api/ocr`, method: 'POST', timeout: 60000, data: { image,format:'math-document-v1' },
    success: res => {
      const result = res.data
      if (res.statusCode !== 200 || !result || result.code !== 0) {
        fail((result && result.msg) || '识别失败，请重试或手动输入')
        return
      }
      let photo
      try { photo = normalizePhoto(result.data) } catch (error) { fail(error.message); return }
      if(!photo.questionDoc){photo.needsReview=true;photo.reviewReasons.push('当前服务返回普通文字，可通过“添加公式”补充数学结构。')}
      photos.retain(selectedPath,(sourceImage,warning)=>{finish();onSuccess({...photo,...(sourceImage?{sourceImage}:{}),...(warning?{sourceImageWarning:warning}:{})})})
    },
    fail: () => fail('无法连接识别服务，请稍后重试或手动输入')
  })
  const read = filePath => wx.getFileSystemManager().readFile({
    filePath, encoding: 'base64', success: res => upload(res.data),
    fail: () => fail('图片读取失败，请重新选择')
  })
  onStart()
  wx.chooseMedia({
    count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
    success: res => {
      const filePath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
      if (!filePath) return fail('没有读取到图片，请重新选择')
      selectedPath=filePath
      wx.showLoading({ title: '正在识别题目和作答…', mask: true })
      wx.compressImage({ src: filePath, quality: 60, success: r => read(r.tempFilePath), fail: () => read(filePath) })
    },
    fail: error => {
      if (error && String(error.errMsg).includes('cancel')) finish()
      else fail('无法打开图片，请检查相机或相册权限')
    }
  })
}

module.exports = { recognizeQuestion, normalizePhoto }
