import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordTab from '@/components/panels/RecordTab.vue'
import { createMockRecorder, mockT } from './ui-test-utils'
import { NTooltip, NTag } from 'naive-ui'
import type { RecordedAction, StepResult } from '@/types/recording'

describe('RecordTab.vue', () => {
  let recorder: ReturnType<typeof createMockRecorder>
  
  beforeEach(() => {
    recorder = createMockRecorder()
    // Create a deep copy or fresh object for each test
    const action: RecordedAction = {
      id: 'step-1',
      type: 'tap',
      timestamp: Date.now(),
      relativeTime: 0,
      waitAfter: 1000,
      onExecuteFailure: 'stop',
      onAssertFailure: 'stop',
      coords: { x: 100, y: 100, scaleX: 0.5, scaleY: 0.5 },
      params: { x: 100, y: 100 }
    }
    recorder.actions.value = [action]
  })

  it('shows failure badge when step has non-default behavior', async () => {
    // Modify action to have 'continue' behavior
    recorder.actions.value[0].onExecuteFailure = 'continue'

    const wrapper = mount(RecordTab, {
      props: {
        recorder,
        currentPlaybackIndex: -1,
        isPlaybackActive: false,
        t: mockT
      },
      global: {
        components: { NTooltip, NTag },
        stubs: {
          NIcon: true,
          NButton: true,
          NButtonGroup: true,
          NSpace: true,
          NEmpty: true,
          NDropdown: true,
          draggable: {
            template: '<div><slot name="item" :element="element" :index="index" /></div>',
            props: ['modelValue', 'element'],
            data() {
              return { element: this.modelValue[0], index: 0 }
            }
          }
        }
      }
    })

    const badge = wrapper.find('.failure-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('continue')
  })

  it('shows global failure badge when global override is enabled', async () => {
    // Enable global override
    recorder.recordingConfig.value.globalFailureControl!.enabled = true
    recorder.recordingConfig.value.globalFailureControl!.onExecuteFailure = 'continue'

    const wrapper = mount(RecordTab, {
      props: {
        recorder,
        currentPlaybackIndex: -1,
        isPlaybackActive: false,
        t: mockT
      },
      global: {
        components: { NTooltip, NTag },
        stubs: {
          NIcon: true,
          NButton: true,
          NButtonGroup: true,
          NSpace: true,
          NEmpty: true,
          NDropdown: true,
          draggable: {
            template: '<div><slot name="item" :element="element" :index="index" /></div>',
            props: ['modelValue', 'element'],
            data() {
              return { element: this.modelValue[0], index: 0 }
            }
          }
        }
      }
    })

    const badge = wrapper.find('.failure-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('global')
    expect(badge.classes()).toContain('continue')
  })

  it('hides failure badge when behavior is default (stop) and global override disabled', async () => {
    const wrapper = mount(RecordTab, {
      props: {
        recorder,
        currentPlaybackIndex: -1,
        isPlaybackActive: false,
        t: mockT
      },
      global: {
        components: { NTooltip, NTag },
        stubs: {
          NIcon: true,
          NButton: true,
          NButtonGroup: true,
          NSpace: true,
          NEmpty: true,
          NDropdown: true,
          draggable: {
            template: '<div><slot name="item" :element="element" :index="index" /></div>',
            props: ['modelValue', 'element'],
            data() {
              return { element: this.modelValue[0], index: 0 }
            }
          }
        }
      }
    })

    expect(wrapper.find('.failure-badge').exists()).toBe(false)
  })
})
