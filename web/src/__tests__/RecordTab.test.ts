import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordTab from '@/components/panels/RecordTab.vue'
import { createMockRecorder, createMockPlayer, mockT } from './ui-test-utils'
import { NTooltip, NTag } from 'naive-ui'
import type { RecordedAction, StepResult } from '@/types/recording'

describe('RecordTab.vue', () => {
  let recorder: ReturnType<typeof createMockRecorder>
  let player: ReturnType<typeof createMockPlayer>

  beforeEach(() => {
    recorder = createMockRecorder()
    player = createMockPlayer()
    // Create a deep copy or fresh object for each test
    const action: RecordedAction = {
      id: 'step-1',
      type: 'tap',
      timestamp: Date.now(),
      relativeTime: 0,
      waitAfter: 1000,
      onFailure: 'stop', // 使用新的统一字段
      coords: { x: 100, y: 100, scaleX: 0.5, scaleY: 0.5 },
      params: { x: 100, y: 100 }
    }
    recorder.actions.value = [action]
  })

  it('shows failure badge when step has non-default behavior', async () => {
    // Modify action to have 'continue' behavior
    recorder.actions.value[0].onFailure = 'continue'

    const wrapper = mount(RecordTab, {
      props: {
        recorder,
        player,
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
    // Enable global override via player
    player.recording.value.config.globalFailureControl!.enabled = true
    player.recording.value.config.globalFailureControl!.onFailure = 'continue'

    const wrapper = mount(RecordTab, {
      props: {
        recorder,
        player,
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
        player,
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
