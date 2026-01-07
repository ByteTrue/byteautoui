import { describe, it, expectTypeOf } from 'vitest'
import type { BaseAction, FailureBehavior, RecordingConfig } from '@/types/recording'

describe('recording types', () => {
  it('FailureBehavior 是 continue/stop 联合类型', () => {
    expectTypeOf<FailureBehavior>().toEqualTypeOf<'continue' | 'stop'>()
  })

  it('BaseAction 包含失败控制字段', () => {
    expectTypeOf<BaseAction['onFailure']>().toEqualTypeOf<FailureBehavior>()
  })

  it('RecordingConfig 支持 globalFailureControl', () => {
    type Global = NonNullable<RecordingConfig['globalFailureControl']>
    expectTypeOf<Global>().toEqualTypeOf<{
      enabled: boolean
      onFailure: FailureBehavior
    }>()
  })
})

