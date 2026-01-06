import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ActionEditDialog from './ActionEditDialog.vue'
import { createPinia, setActivePinia } from 'pinia'
import { NModal, NForm } from 'naive-ui'

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock i18n store
vi.mock('@/stores/i18n', () => ({
  useI18nStore: () => ({
    t: {
      common: { save: 'Save', cancel: 'Cancel' },
      actions: {
        editAction: 'Edit Action',
        actionTypes: { tap: 'Tap', assert: 'Assert' },
        failureControl: 'Failure Control',
        onExecuteFailure: 'On Execute Failure',
        onAssertFailure: 'On Assert Failure',
        stop: 'Stop',
        continue: 'Continue',
        waitAfter: 'Wait After',
        milliseconds: 'ms',
        coordinateX: 'X',
        coordinateY: 'Y',
        xpathSelector: 'XPath',
        xpathPlaceholder: 'XPath Placeholder',
        startPosition: 'Start',
        endPosition: 'End',
        swipeDuration: 'Duration',
        seconds: 's',
        inputText: 'Text',
        sleepDuration: 'Sleep',
        command: 'Command',
      }
    }
  })
}))

describe('ActionEditDialog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const mockAction = {
    id: '1',
    type: 'tap',
    timestamp: 1000,
    relativeTime: 1000,
    waitAfter: 0,
    onExecuteFailure: 'stop',
    onAssertFailure: 'stop',
    coords: { x: 100, y: 100, scaleX: 0.1, scaleY: 0.1 },
    params: { x: 100, y: 100 }
  }

  const screenSize = { width: 1000, height: 1000 }

  it('renders correctly', async () => {
    const wrapper = shallowMount(ActionEditDialog, {
      props: {
        show: true,
        action: mockAction as any,
        screenSize
      },
      global: {
        stubs: {
          NModal: {
            template: '<div><slot /><slot name="action" /></div>',
            props: ['show', 'title', 'positiveText', 'negativeText']
          },
          NForm: {
            template: '<form><slot /></form>'
          }
        }
      }
    })

    expect(wrapper.text()).toContain('Edit Action')
    expect(wrapper.text()).toContain('Failure Control')
    expect(wrapper.text()).toContain('On Execute Failure')
    expect(wrapper.text()).not.toContain('On Assert Failure')
  })

  it('shows onAssertFailure for assert action', async () => {
    const assertAction = {
      ...mockAction,
      type: 'assert',
      params: {
        operator: 'and',
        conditions: []
      }
    }

    const wrapper = shallowMount(ActionEditDialog, {
      props: {
        show: true,
        action: assertAction as any,
        screenSize
      },
      global: {
        stubs: {
          NModal: {
            template: '<div><slot /></div>'
          },
          NForm: { template: '<form><slot /></form>' }
        }
      }
    })

    expect(wrapper.text()).toContain('On Assert Failure')
  })

  it('emits save event with updates', async () => {
    const wrapper = shallowMount(ActionEditDialog, {
      props: {
        show: true,
        action: mockAction as any,
        screenSize
      },
      global: {
        stubs: {
          NModal: {
            template: '<div><slot /><button @click="$emit(\'positive-click\')">Save</button></div>',
            emits: ['positive-click']
          },
          NForm: { template: '<form><slot /></form>' }
        }
      }
    })

    // Modify state directly
    const vm = wrapper.vm as any
    vm.formData.onExecuteFailure = 'continue'
    
    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('save')).toBeTruthy()
    const args = wrapper.emitted('save')![0]
    expect(args[0]).toBe('1')
    expect(args[1]).toEqual(expect.objectContaining({
      onExecuteFailure: 'continue'
    }))
  })
})
