import { unwrapZhihuRedirect } from '../lib/zhihu'

const target = unwrapZhihuRedirect(location.href)
if (target) location.replace(target)
