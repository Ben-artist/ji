import OcrApiImport, {
  RecognizeAllTextRequest,
} from '@alicloud/ocr-api20210707'
import { Config } from '@alicloud/openapi-client'
import { Readable } from 'node:stream'

type OcrClient = {
  recognizeAllText: (
    request: InstanceType<typeof RecognizeAllTextRequest>,
  ) => Promise<{ body?: { data?: { content?: string } } }>
}

type OcrClientCtor = new (config: Config) => OcrClient

/**
 * Vite SSR / ESM 下阿里云 SDK default 常是 namespace，需再解一层才是 Client 构造函数。
 * @param mod 包的 default 导出
 * @returns Client 构造函数
 */
function resolveOcrClientCtor(mod: unknown): OcrClientCtor {
  let current: unknown = mod
  for (let i = 0; i < 3; i += 1) {
    if (typeof current === 'function') {
      return current as OcrClientCtor
    }
    if (current && typeof current === 'object' && 'default' in current) {
      current = (current as { default: unknown }).default
      continue
    }
    break
  }
  throw new Error('无法加载阿里云 OCR Client（模块导出不兼容）')
}

const OcrApi = resolveOcrClientCtor(OcrApiImport)

/**
 * 读取阿里云 OCR 所需的 AccessKey。
 * @returns accessKeyId / accessKeySecret / endpoint
 * @throws 未配置时抛错
 */
export function getAliyunOcrConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  const accessKeyId = (
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ||
    env?.ALIBABA_CLOUD_ACCESS_KEY_ID ||
    ''
  ).trim()
  const accessKeySecret = (
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ||
    env?.ALIBABA_CLOUD_ACCESS_KEY_SECRET ||
    ''
  ).trim()
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      '缺少 ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET（阿里云 OCR 需 RAM AccessKey，不是百炼 sk-）',
    )
  }
  return {
    accessKeyId,
    accessKeySecret,
    endpoint: (
      process.env.ALIYUN_OCR_ENDPOINT ||
      env?.ALIYUN_OCR_ENDPOINT ||
      'ocr-api.cn-hangzhou.aliyuncs.com'
    ).trim(),
  }
}

/**
 * 将 data URL 转为 Buffer。
 * @param imageDataUrl data:image/...;base64,...
 * @returns 图片二进制
 */
function dataUrlToBuffer(imageDataUrl: string): Buffer {
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/i)
  if (!match) {
    throw new Error('仅支持 data URL 图片上传')
  }
  return Buffer.from(match[2], 'base64')
}

/**
 * Buffer 转 Readable，供 OCR SDK body 使用。
 * @param buffer 图片二进制
 * @returns Readable 流
 */
function bufferToReadable(buffer: Buffer): Readable {
  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)
  return stream
}

/**
 * 调用阿里云 OCR 统一识别（RecognizeAllText / Advanced）。
 * @param imageDataUrl 截图 data URL
 * @returns 识别出的纯文本
 */
export async function aliyunOcrRecognizeText(
  imageDataUrl: string,
): Promise<string> {
  const { accessKeyId, accessKeySecret, endpoint } = getAliyunOcrConfig()
  const config = new Config({
    accessKeyId,
    accessKeySecret,
    endpoint,
  })
  const client = new OcrApi(config)
  const buffer = dataUrlToBuffer(imageDataUrl)
  const request = new RecognizeAllTextRequest({
    type: 'Advanced',
    body: bufferToReadable(buffer),
  })
  const response = await client.recognizeAllText(request)
  const content = response.body?.data?.content?.trim()
  if (!content) {
    throw new Error('阿里云 OCR 未返回文本，请换更清晰的截图')
  }
  return content
}
