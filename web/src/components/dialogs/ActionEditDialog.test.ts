import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ActionEditDialog from './ActionEditDialog.vue'
import { createPinia, setActivePinia } from 'pinia'

// Mock Naive UI components
vi.mock('naive-ui', () => ({
  useMessage: () => ({
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
  NModal: {
    template: `
      <div class="n-modal">
        <div class="title">{{ title }}</div>
        <slot />
        <slot name="action" />
        <button class="save-btn" @click="$emit('positive-click')">Save</button>
      </div>
    `,
    props: ['title', 'show']
  },
  NForm: {
    template: '<form><slot /></form>',
    methods: {
      validate: () => Promise.resolve()
    }
  },
  NFormItem: {
    template: '<div class="n-form-item"><label>{{ label }}</label><slot /></div>',
    props: ['label']
  },
  NDivider: { template: '<div class="n-divider"><slot /></div>' },
  NInputNumber: { template: '<input class="n-input-number" :value="value" @input="$emit(\'update:value\', Number($event.target.value))" />', props: ['value'] },
  NInput: { template: '<input class="n-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value'] },
  NSelect: { template: '<select class="n-select" :value="value" @change="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'options'] },
  NTag: { template: '<span class="n-tag"><slot /></span>' },
  NRadioGroup: { template: '<div class="n-radio-group"><slot /></div>' },
  NRadio: { template: '<label class="n-radio"><input type="radio" :value="value" /> <slot /></label>', props: ['value'] },
  NSwitch: { template: '<input type="checkbox" class="n-switch" />' },
  NEmpty: { template: '<div class="n-empty"><slot /></div>' }
}))

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock i18n store - 使用新的统一 failureControl 结构
vi.mock('@/stores/i18n', () => ({
  useI18nStore: () => ({
    t: {
      common: { save: 'Save', cancel: 'Cancel' },
      actions: {
        editAction: 'Edit Action',
        actionTypes: { tap: 'Tap', assert: 'Assert' },
        failureControl: {
          title: 'Failure Control',
          onExecute: 'On Execute Failure',
          onAssert: 'On Assert Failure',
          behaviors: {
            stop: 'Stop',
            continue: 'Continue'
          }
        },
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
    onFailure: 'stop', // 使用新的统一字段
    coords: { x: 100, y: 100, scaleX: 0.1, scaleY: 0.1 },
    params: { x: 100, y: 100 }
  }

  const screenSize = { width: 1000, height: 1000 }

  it('renders correctly', async () => {
    const wrapper = mount(ActionEditDialog, {
      props: {
        show: true,
        action: mockAction as any,
        screenSize
      }
    })

    expect(wrapper.text()).toContain('Edit Action')
    // 检查失败控制相关文本
    expect(wrapper.text()).toMatch(/执行失败时停止回放|Stop on failure/)
  })

  it('shows failure control for assert action', async () => {
    const assertAction = {
      ...mockAction,
      type: 'assert',
      params: {
        operator: 'and',
        conditions: []
      }
    }

    const wrapper = mount(ActionEditDialog, {
      props: {
        show: true,
        action: assertAction as any,
        screenSize
      }
    })

    // 断言操作也应该显示失败控制
    expect(wrapper.text()).toMatch(/执行失败时停止回放|Stop on failure/)
  })

  it('emits save event with updates', async () => {
    const wrapper = mount(ActionEditDialog, {
      props: {
        show: true,
        action: mockAction as any,
        screenSize
      }
    })

    // 修改 stopOnFailure 状态（false = continue）
    const vm = wrapper.vm as any
    vm.formData.stopOnFailure = false

    await wrapper.find('.save-btn').trigger('click')

    expect(wrapper.emitted('save')).toBeTruthy()
    const args = wrapper.emitted('save')?.[0]
    expect(args).toBeDefined()
    expect(args![0]).toBe('1')
    expect(args![1]).toEqual(expect.objectContaining({
      onFailure: 'continue' // 应该输出新的统一字段
    }))
  })

  it('handles actions without coords (xpath-based actions)', async () => {
    const xpathAction = {
      id: '2',
      type: 'tap',
      timestamp: 2000,
      relativeTime: 2000,
      waitAfter: 0,
      onFailure: 'stop',
      // 没有 coords（因为有 xpath）
      xpath: { selector: '//button[@text="OK"]' },
      params: { x: 100, y: 100 }
    }

    const wrapper = mount(ActionEditDialog, {
      props: {
        show: true,
        action: xpathAction as any,
        screenSize
      }
    })

    // 应该能正常渲染，不会因为访问 undefined.coords 而报错
    expect(wrapper.text()).toContain('Edit Action')

    // 修改 waitAfter
    const vm = wrapper.vm as any
    vm.formData.waitAfter = 500

    await wrapper.find('.save-btn').trigger('click')

    expect(wrapper.emitted('save')).toBeTruthy()
    const args = wrapper.emitted('save')?.[0]
    expect(args).toBeDefined()
    expect(args![1]).toEqual(expect.objectContaining({
      waitAfter: 500
    }))
  })
})
