import type { GlobalThemeOverrides } from 'naive-ui'

// 设计常量 - 单一真相源
const DESIGN_TOKENS = {
  // 颜色系统 - 保持现有MD3定义
  primary: '#1890FF',
  primaryHover: '#40A9FF',
  primaryPressed: '#096DD9',
  success: '#52C41A',
  warning: '#FAAD14',
  error: '#FF4D4F',
  info: '#1890FF',

  // 圆角系统 - 3级足够
  radiusSmall: '6px',
  radiusMedium: '8px',
  radiusLarge: '12px',

  // 间距系统 - 从7级简化为4级
  spaceXs: '8px',
  spaceSm: '12px',
  spaceMd: '16px',
  spaceLg: '24px',

  // 字体系统
  fontFamily: "'JetBrains Mono', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Monaco', 'Consolas', monospace",
}

// 亮色主题配置
export const lightTheme: GlobalThemeOverrides = {
  common: {
    // 字体
    fontFamily: DESIGN_TOKENS.fontFamily,
    fontFamilyMono: DESIGN_TOKENS.fontFamilyMono,

    // 主题色
    primaryColor: DESIGN_TOKENS.primary,
    primaryColorHover: DESIGN_TOKENS.primaryHover,
    primaryColorPressed: DESIGN_TOKENS.primaryPressed,
    successColor: DESIGN_TOKENS.success,
    warningColor: DESIGN_TOKENS.warning,
    errorColor: DESIGN_TOKENS.error,
    infoColor: DESIGN_TOKENS.info,

    // 圆角
    borderRadius: DESIGN_TOKENS.radiusMedium,
    borderRadiusSmall: DESIGN_TOKENS.radiusSmall,

    // 背景色系统
    bodyColor: '#FFFFFF',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    popoverColor: '#FFFFFF',
    tableColor: '#FFFFFF',

    // 文本色系统
    textColorBase: '#333333',
    textColor1: '#333333',
    textColor2: '#666666',
    textColor3: '#999999',
    textColorDisabled: '#CCCCCC',

    // 边框和分隔线
    borderColor: '#E8E8E8',
    dividerColor: '#E8E8E8',

    // 阴影系统 - 双层阴影
    boxShadow1: '0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.02)',
    boxShadow2: '0 3px 6px rgba(0, 0, 0, 0.06), 0 6px 12px rgba(0, 0, 0, 0.04)',
    boxShadow3: '0 6px 16px rgba(0, 0, 0, 0.08), 0 9px 28px rgba(0, 0, 0, 0.05)',
  },

  // 按钮组件定制
  Button: {
    borderRadiusMedium: DESIGN_TOKENS.radiusMedium,
    borderRadiusSmall: DESIGN_TOKENS.radiusSmall,
    borderRadiusLarge: DESIGN_TOKENS.radiusLarge,
    paddingMedium: `0 ${DESIGN_TOKENS.spaceMd}`,
    heightMedium: '32px',
    heightSmall: '28px',
    heightLarge: '40px',
  },

  // 卡片组件定制
  Card: {
    borderRadius: DESIGN_TOKENS.radiusMedium,
    paddingMedium: DESIGN_TOKENS.spaceMd,
    paddingLarge: DESIGN_TOKENS.spaceLg,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.02)',
  },

  // 输入框组件定制
  Input: {
    borderRadius: DESIGN_TOKENS.radiusSmall,
    heightMedium: '32px',
    paddingMedium: `0 ${DESIGN_TOKENS.spaceSm}`,
  },

  // 标签页组件定制
  Tabs: {
    tabBorderRadius: DESIGN_TOKENS.radiusSmall,
    tabPaddingMedium: `${DESIGN_TOKENS.spaceSm} ${DESIGN_TOKENS.spaceMd}`,
  },

  // 标签组件定制
  Tag: {
    borderRadius: DESIGN_TOKENS.radiusSmall,
  },
}

// 暗色主题配置
export const darkTheme: GlobalThemeOverrides = {
  common: {
    // 字体
    fontFamily: DESIGN_TOKENS.fontFamily,
    fontFamilyMono: DESIGN_TOKENS.fontFamilyMono,

    // 主题色 - 与亮色保持一致
    primaryColor: DESIGN_TOKENS.primary,
    primaryColorHover: DESIGN_TOKENS.primaryHover,
    primaryColorPressed: DESIGN_TOKENS.primaryPressed,
    successColor: DESIGN_TOKENS.success,
    warningColor: DESIGN_TOKENS.warning,
    errorColor: DESIGN_TOKENS.error,
    infoColor: DESIGN_TOKENS.info,

    // 圆角 - 与亮色保持一致
    borderRadius: DESIGN_TOKENS.radiusMedium,
    borderRadiusSmall: DESIGN_TOKENS.radiusSmall,

    // 背景色系统 - Zinc色系
    bodyColor: '#18181C',        // Zinc 950
    cardColor: '#27272A',        // Zinc 800
    modalColor: '#27272A',
    popoverColor: '#27272A',
    tableColor: '#27272A',

    // 文本色系统 - Zinc色系
    textColorBase: '#E4E4E7',    // Zinc 200
    textColor1: '#E4E4E7',       // Zinc 200
    textColor2: '#A1A1AA',       // Zinc 400
    textColor3: '#71717A',       // Zinc 500
    textColorDisabled: '#52525B', // Zinc 600

    // 边框和分隔线
    borderColor: '#3F3F46',      // Zinc 700
    dividerColor: '#3F3F46',

    // 阴影系统 - 暗色模式加强对比
    boxShadow1: '0 1px 2px rgba(0, 0, 0, 0.24), 0 2px 4px rgba(0, 0, 0, 0.12)',
    boxShadow2: '0 3px 6px rgba(0, 0, 0, 0.32), 0 6px 12px rgba(0, 0, 0, 0.16)',
    boxShadow3: '0 6px 16px rgba(0, 0, 0, 0.40), 0 9px 28px rgba(0, 0, 0, 0.20)',
  },

  // 按钮组件定制 - 与亮色保持一致
  Button: {
    borderRadiusMedium: DESIGN_TOKENS.radiusMedium,
    borderRadiusSmall: DESIGN_TOKENS.radiusSmall,
    borderRadiusLarge: DESIGN_TOKENS.radiusLarge,
    paddingMedium: `0 ${DESIGN_TOKENS.spaceMd}`,
    heightMedium: '32px',
    heightSmall: '28px',
    heightLarge: '40px',
  },

  // 卡片组件定制
  Card: {
    borderRadius: DESIGN_TOKENS.radiusMedium,
    paddingMedium: DESIGN_TOKENS.spaceMd,
    paddingLarge: DESIGN_TOKENS.spaceLg,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.24), 0 2px 4px rgba(0, 0, 0, 0.12)',
  },

  // 输入框组件定制 - 与亮色保持一致
  Input: {
    borderRadius: DESIGN_TOKENS.radiusSmall,
    heightMedium: '32px',
    paddingMedium: `0 ${DESIGN_TOKENS.spaceSm}`,
  },

  // 标签页组件定制 - 与亮色保持一致
  Tabs: {
    tabBorderRadius: DESIGN_TOKENS.radiusSmall,
    tabPaddingMedium: `${DESIGN_TOKENS.spaceSm} ${DESIGN_TOKENS.spaceMd}`,
  },

  // 标签组件定制 - 与亮色保持一致
  Tag: {
    borderRadius: DESIGN_TOKENS.radiusSmall,
  },
}
