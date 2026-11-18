// Every Lucide icon the app imports, as of 2026-11-18: where each is used, and the Fluent icons proposed in its
// place. The shadcn kit's own icons are left out, since shadcn-sync swaps them.
import type { AuditedIcon } from "./types.ts"

export const auditedIcons: AuditedIcon[] = [
  {
    lucide: "Accessibility",
    lucideKey: "Accessibility",
    context: "Accessibility tab, process and annotation kind",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/Inspector.tsx",
        line: 25,
        code: '{ value: "accessibility", label: "Accessibility", icon: Accessibility },',
        area: "app"
      },
      {
        file: "chrome/Inspector.tsx",
        line: 40,
        code: '<ErrorBoundary name="inspector.accessibility" label="Accessibility">',
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 70,
        code: 'accessibility: { icon: Accessibility, tint: "oklch(0.72 0.17 330)", role: "Checks accessibility" }',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-kinds.ts",
        line: 11,
        code: 'accessibility: { name: "Accessibility", icon: Accessibility, hue: 300 },',
        area: "app"
      },
      {
        file: "explorations/screen-container/workspace.tsx",
        line: 68,
        code: '{ value: "accessibility", label: "Accessibility", icon: Accessibility }',
        area: "exploration"
      },
      {
        file: "packages/presence-ui/src/AgentPointer.tsx",
        line: 98,
        code: "accessibility: Accessibility,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Accessibility",
      file: "accessibility",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AccessibilityMore",
        file: "accessibility-more",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AccessibilityCheckmark",
        file: "accessibility-checkmark",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PersonStanding",
        file: "person-standing",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "WheelchairAccess",
        file: "wheelchair-access",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Activity",
    lucideKey: "Activity",
    context: "Activity nav item",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/portal/parts.tsx",
        line: 152,
        code: '<NavItem icon={<Activity className="size-4" />} label="Activity" active={active === "activity"} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Pulse",
      file: "pulse",
      sizes: [20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DataLine",
        file: "data-line",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "History",
        file: "history",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Alert",
        file: "alert",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ArrowTrending",
        file: "arrow-trending",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ALargeSmall",
    lucideKey: "ALargeSmall",
    context: "Font size field",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "inspector/controls/font-fields.tsx",
        line: 986,
        code: 'inner={<ALargeSmall aria-hidden className="size-3.5" />}',
        area: "app"
      },
      {
        file: "inspector/controls/preset-text.tsx",
        line: 505,
        code: 'size: <ALargeSmall aria-hidden className="size-3.5" />,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextFontSize",
      file: "text-font-size",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextFont",
        file: "text-font",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextCaseTitle",
        file: "text-case-title",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextT",
        file: "text-t",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "FontIncrease",
        file: "font-increase",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignCenter",
    lucideKey: "TextAlignCenter",
    context: "Text align: center",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/keyword-sets.tsx",
        line: 546,
        code: 'icon: <AlignCenter className="size-3.5" />,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextAlignCenter",
      file: "text-align-center",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextboxAlignCenter",
        file: "textbox-align-center",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignCenterHorizontal",
        file: "align-center-horizontal",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignDistributed",
        file: "text-align-distributed",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignJustify",
        file: "text-align-justify",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignCenterHorizontal",
    lucideKey: "AlignCenterHorizontal",
    context: "Align layers: middle",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 110,
        code: "alignMiddle: AlignCenterHorizontal,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 40,
        code: '{ command: "alignMiddle", icon: AlignCenterHorizontal },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignCenterHorizontal",
      file: "align-center-horizontal",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignCenterVertical",
        file: "align-center-vertical",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CenterHorizontal",
        file: "center-horizontal",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignSpaceEvenlyVertical",
        file: "align-space-evenly-vertical",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignStretchHorizontal",
        file: "align-stretch-horizontal",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignCenterVertical",
    lucideKey: "AlignCenterVertical",
    context: "Align layers: center",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 107,
        code: "alignCenter: AlignCenterVertical,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 37,
        code: '{ command: "alignCenter", icon: AlignCenterVertical },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignCenterVertical",
      file: "align-center-vertical",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignCenterHorizontal",
        file: "align-center-horizontal",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CenterVertical",
        file: "center-vertical",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignSpaceEvenlyHorizontal",
        file: "align-space-evenly-horizontal",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignStretchVertical",
        file: "align-stretch-vertical",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignEndHorizontal",
    lucideKey: "AlignEndHorizontal",
    context: "Align layers: bottom",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 111,
        code: "alignBottom: AlignEndHorizontal,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 41,
        code: '{ command: "alignBottom", icon: AlignEndHorizontal }',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignBottom",
      file: "align-bottom",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignEndHorizontal",
        file: "align-end-horizontal",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignDistributeBottom",
        file: "align-distribute-bottom",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "TextboxAlignBottomCenter",
        file: "textbox-align-bottom-center",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMinimizeVertical",
        file: "arrow-minimize-vertical",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignEndVertical",
    lucideKey: "AlignEndVertical",
    context: "Align layers: right",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 108,
        code: "alignRight: AlignEndVertical,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 38,
        code: '{ command: "alignRight", icon: AlignEndVertical },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignRight",
      file: "align-right",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignEndVertical",
        file: "align-end-vertical",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignDistributeRight",
        file: "align-distribute-right",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "TextboxAlignMiddleRight",
        file: "textbox-align-middle-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignRight",
        file: "text-align-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignHorizontalSpaceAround",
    lucideKey: "AlignHorizontalSpaceAround",
    context: "Distribute horizontally",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 112,
        code: "distributeHorizontal: AlignHorizontalSpaceAround,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 65,
        code: "<AlignHorizontalSpaceAround />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignSpaceEvenlyHorizontal",
      file: "align-space-evenly-horizontal",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignSpaceAroundHorizontal",
        file: "align-space-around-horizontal",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignSpaceBetweenHorizontal",
        file: "align-space-between-horizontal",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignDistributeLeft",
        file: "align-distribute-left",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "ArrowAutofitWidth",
        file: "arrow-autofit-width",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignJustify",
    lucideKey: "TextAlignJustify",
    context: "Text align: justify",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/keyword-sets.tsx",
        line: 558,
        code: 'icon: <AlignJustify className="size-3.5" />,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextAlignJustify",
      file: "text-align-justify",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextAlignJustifyLow",
        file: "text-align-justify-low",
        sizes: [20, 24, 90],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignDistributed",
        file: "text-align-distributed",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignLeft",
        file: "text-align-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextDensity",
        file: "text-density",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignLeft",
    lucideKey: "TextAlignStart",
    context: "Text align: left",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/keyword-sets.tsx",
        line: 540,
        code: 'icon: <AlignLeft className="size-3.5" />,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextAlignLeft",
      file: "text-align-left",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextboxAlignMiddleLeft",
        file: "textbox-align-middle-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignLeft",
        file: "align-left",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextIndentDecrease",
        file: "text-indent-decrease",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignJustify",
        file: "text-align-justify",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignRight",
    lucideKey: "TextAlignEnd",
    context: "Text align: right",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/keyword-sets.tsx",
        line: 552,
        code: 'icon: <AlignRight className="size-3.5" />,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextAlignRight",
      file: "text-align-right",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextboxAlignMiddleRight",
        file: "textbox-align-middle-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlignRight",
        file: "align-right",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextIndentIncrease",
        file: "text-indent-increase",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignJustify",
        file: "text-align-justify",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignStartHorizontal",
    lucideKey: "AlignStartHorizontal",
    context: "Align layers: top",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 109,
        code: "alignTop: AlignStartHorizontal,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 39,
        code: '{ command: "alignTop", icon: AlignStartHorizontal },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignTop",
      file: "align-top",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignStartHorizontal",
        file: "align-start-horizontal",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignDistributeTop",
        file: "align-distribute-top",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "TextboxAlignTopCenter",
        file: "textbox-align-top-center",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMaximizeVertical",
        file: "arrow-maximize-vertical",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignStartVertical",
    lucideKey: "AlignStartVertical",
    context: "Align layers: left",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 106,
        code: "alignLeft: AlignStartVertical,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 35,
        code: "const alignments: { command: Command; icon: typeof AlignStartVertical }[] = [",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 36,
        code: '{ command: "alignLeft", icon: AlignStartVertical },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignLeft",
      file: "align-left",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignStartVertical",
        file: "align-start-vertical",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignDistributeLeft",
        file: "align-distribute-left",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "TextboxAlignMiddleLeft",
        file: "textbox-align-middle-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignLeft",
        file: "text-align-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AlignVerticalSpaceAround",
    lucideKey: "AlignVerticalSpaceAround",
    context: "Distribute vertically",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 113,
        code: "distributeVertical: AlignVerticalSpaceAround,",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 72,
        code: "<AlignVerticalSpaceAround />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlignSpaceEvenlyVertical",
      file: "align-space-evenly-vertical",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlignSpaceAroundVertical",
        file: "align-space-around-vertical",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignSpaceBetweenVertical",
        file: "align-space-between-vertical",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "AlignDistributeTop",
        file: "align-distribute-top",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "ArrowAutofitHeight",
        file: "arrow-autofit-height",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Apple",
    lucideKey: "Apple",
    context: "Emoji category: food",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 37,
        code: '["food", Apple],',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Food",
      file: "food",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "FoodApple",
        file: "food-apple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "FoodPizza",
        file: "food-pizza",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "FoodCake",
        file: "food-cake",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BowlChopsticks",
        file: "bowl-chopsticks",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AppWindow",
    lucideKey: "AppWindow",
    context: "Screen kind, new screen, API routes",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 152,
        code: "* Each kind's icon: AppWindow for a screen, Component for a component, and Figma's frame glyph for a frame. A page of",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 178,
        code: 'return kind === "component" ? <Component {...props} /> : <AppWindow {...props} />',
        area: "app"
      },
      {
        file: "chrome/ApiRoutes.tsx",
        line: 131,
        code: "<AppWindow />",
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 90,
        code: "newScreen: AppWindow,",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/FrameMenu.tsx",
        line: 60,
        code: "<AppWindow style={{ color: textFor(kindColors.screen) }} />",
        area: "app"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 59,
        code: "Icon: AppWindow,",
        area: "exploration"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 194,
        code: 'screen: { icon: AppWindow, color: kindColors.screen, word: "Screen" },',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 707,
        code: "<AppWindow /> Open",
        area: "exploration"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "Window",
      file: "window",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "WindowApps",
        file: "window-apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "WindowText",
        file: "window-text",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "TabDesktop",
        file: "tab-desktop",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Desktop",
        file: "desktop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Armchair",
    lucideKey: "Armchair",
    context: "Editor seat freed (admin)",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/portal/admin.tsx",
        line: 764,
        code: "<Consequence icon={<Armchair />}>",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Seat",
      file: "seat",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SeatAdd",
        file: "seat-add",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PersonBoard",
        file: "person-board",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "PersonSquare",
        file: "person-square",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "TicketDiagonal",
        file: "ticket-diagonal",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowDown",
    lucideKey: "ArrowDown",
    context: "Layout direction: vertical",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 65,
        code: '{ value: "column", label: "Vertical", detail: "Children stack top to bottom", icon: <ArrowDown /> },',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1404,
        code: 'aria-keyshortcuts="ArrowUp ArrowDown Delete"',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowDown",
      file: "arrow-down",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowSortDown",
        file: "arrow-sort-down",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleDown",
        file: "arrow-circle-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDown",
        file: "chevron-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextDirectionVertical",
        file: "text-direction-vertical",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowDownUp",
    lucideKey: "ArrowDownUp",
    context: "Switch layout direction (from column)",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 258,
        code: "{row ? <ArrowRightLeft /> : <ArrowDownUp />}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowSort",
      file: "arrow-sort",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowBidirectionalUpDown",
        file: "arrow-bidirectional-up-down",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowTurnDownUp",
        file: "arrow-turn-down-up",
        sizes: [20, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSwap",
        file: "arrow-swap",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowLeft",
    lucideKey: "ArrowLeft",
    context: "Back buttons",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/instance-slots.tsx",
        line: 292,
        code: 'if (event.key === "ArrowLeft" && !(event.target instanceof HTMLInputElement && event.target.value)) {',
        area: "app"
      },
      {
        file: "chrome/instance-slots.tsx",
        line: 356,
        code: '<ArrowLeft className="size-3" /> {name}',
        area: "app"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 247,
        code: "<ArrowLeft />",
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 487,
        code: '<ArrowLeft className="size-4" /> {stack.name} templates',
        area: "exploration"
      },
      {
        file: "media/MediaUses.tsx",
        line: 171,
        code: "<ArrowLeft />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowLeft",
      file: "arrow-left",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChevronLeft",
        file: "chevron-left",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowPrevious",
        file: "arrow-previous",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleLeft",
        file: "arrow-circle-left",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowHookUpLeft",
        file: "arrow-hook-up-left",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowLeftRight",
    lucideKey: "ArrowLeftRight",
    context: "Paint stack: swap",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/paint-stack.tsx",
        line: 612,
        code: "<ArrowLeftRight />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowSwap",
      file: "arrow-swap",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowBidirectionalLeftRight",
        file: "arrow-bidirectional-left-right",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowTurnLeftRight",
        file: "arrow-turn-left-right",
        sizes: [20, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSort",
        file: "arrow-sort",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowRight",
    lucideKey: "ArrowRight",
    context: "Continue, go-to links",
    areas: ["app", "exploration"],
    files: 8,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 489,
        code: '<ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />',
        area: "app"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 436,
        code: '{children} <ArrowRight className="size-3" />',
        area: "exploration"
      },
      {
        file: "explorations/start/first-run.tsx",
        line: 103,
        code: "Open the sample <ArrowRight />",
        area: "exploration"
      },
      {
        file: "explorations/start/first-run.tsx",
        line: 118,
        code: '<ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/source:opacity-100" />',
        area: "exploration"
      },
      {
        file: "explorations/start/first-run.tsx",
        line: 154,
        code: 'All templates <ArrowRight className="size-3" />',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 1169,
        code: 'Use template <ArrowRight className="size-3" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 206,
        code: 'Play level 6 <ArrowRight className="size-6" strokeWidth={3} />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 617,
        code: 'Continue <ArrowRight className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 6,
    fluent: {
      name: "ArrowRight",
      file: "arrow-right",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowForward",
        file: "arrow-forward",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowNext",
        file: "arrow-next",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronRight",
        file: "chevron-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleRight",
        file: "arrow-circle-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowRightLeft",
    lucideKey: "ArrowRightLeft",
    context: "Switch layout direction (from row)",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 258,
        code: "{row ? <ArrowRightLeft /> : <ArrowDownUp />}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowSwap",
      file: "arrow-swap",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowBidirectionalLeftRight",
        file: "arrow-bidirectional-left-right",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowTurnLeftRight",
        file: "arrow-turn-left-right",
        sizes: [20, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSort",
        file: "arrow-sort",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowUp",
    lucideKey: "ArrowUp",
    context: "Comments: move up",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 549,
        code: 'if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 720,
        code: "<ArrowUp />",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowUp",
      file: "arrow-up",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChevronUp",
        file: "chevron-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSortUp",
        file: "arrow-sort-up",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleUp",
        file: "arrow-circle-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowUpload",
        file: "arrow-upload",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowUpRight",
    lucideKey: "ArrowUpRight",
    context: "Go to component, library links",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 466,
        code: '<ArrowUpRight className="size-3" />',
        area: "app"
      },
      {
        file: "chrome/AddLibraryDialog/LibraryLinks.tsx",
        line: 23,
        code: '<ArrowUpRight className="size-3.5 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/SelectionHeading.tsx",
        line: 71,
        code: '"go-to-component": { label: "Go to component", icon: <ArrowUpRight /> }',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 93,
        code: "icon: ArrowUpRight,",
        area: "app"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 213,
        code: '<ArrowUpRight className="size-3.5 shrink-0" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowUpRight",
      file: "arrow-up-right",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Open",
        file: "open",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleUpRight",
        file: "arrow-circle-up-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowOutlineUpRight",
        file: "arrow-outline-up-right",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowExportUp",
        file: "arrow-export-up",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ArrowUpToLine",
    lucideKey: "ArrowUpToLine",
    context: "Push to main, pin to top",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "inspector/controls/instance-section.tsx",
        line: 348,
        code: "<ArrowUpToLine /> Push to main",
        area: "app"
      },
      {
        file: "inspector/controls/pin-box.tsx",
        line: 42,
        code: "Icon: ArrowUpToLine",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowUpload",
      file: "arrow-upload",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowExportUp",
        file: "arrow-export-up",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "AlignTop",
        file: "align-top",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleUp",
        file: "arrow-circle-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CloudArrowUp",
        file: "cloud-arrow-up",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AtSign",
    lucideKey: "AtSign",
    context: "Mentions",
    areas: ["exploration"],
    files: 4,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 675,
        code: "<AtSign />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 137,
        code: 'mention: { verb: "mentioned you", icon: AtSign, color: commentBlue },',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 217,
        code: "icon: AtSign,",
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 16,
        code: "const kindIcons: Record<ActivityKind, typeof AtSign> = {",
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 17,
        code: "mention: AtSign,",
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 156,
        code: "const kindIcons: Record<ActivityKind, typeof AtSign> = {",
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 157,
        code: "mention: AtSign,",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Mention",
      file: "mention",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CommentMention",
        file: "comment-mention",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "MentionArrowDown",
        file: "mention-arrow-down",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "MentionBrackets",
        file: "mention-brackets",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "PersonTag",
        file: "person-tag",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "AudioLines",
    lucideKey: "AudioLines",
    context: "Audio element kind",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 54,
        code: '"audio-lines": AudioLines,',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 238,
        code: "icon: AudioLines,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SoundWaveCircle",
      file: "sound-wave-circle",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Speaker2",
        file: "speaker",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "MusicNote2",
        file: "music-note",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "HeadphonesSoundWave",
        file: "headphones-sound-wave",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "MicPulse",
        file: "mic-pulse",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Ban",
    lucideKey: "Ban",
    context: "Refused / blocked status",
    areas: ["app"],
    files: 4,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 336,
        code: 'refused: { icon: <Ban />, color: "oklch(0.62 0.2 25)" },',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 180,
        code: "<Ban />",
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 151,
        code: "<Ban />",
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 155,
        code: '["not-allowed", Ban],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Prohibited",
      file: "prohibited",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ProhibitedMultiple",
        file: "prohibited-multiple",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DismissCircle",
        file: "dismiss-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "SubtractCircle",
        file: "subtract-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ShieldProhibited",
        file: "shield-prohibited",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "BatteryFull",
    lucideKey: "BatteryFull",
    context: "Device status bar mock",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/render-kit.tsx",
        line: 190,
        code: '<BatteryFull className="size-5" strokeWidth={2} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Battery10",
      file: "battery",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Battery9",
        file: "battery",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "BatteryCharge",
        file: "battery-charge",
        sizes: [10, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "BatteryCheckmark",
        file: "battery-checkmark",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Battery5",
        file: "battery",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Bell",
    lucideKey: "Bell",
    context: "Notifications",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/start/page.tsx",
        line: 329,
        code: '<Bell className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 418,
        code: '<Bell className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 71,
        code: '<Bell className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Alert",
      file: "alert",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "AlertBadge",
        file: "alert-badge",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "AlertOn",
        file: "alert-on",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AlertUrgent",
        file: "alert-urgent",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "MailInbox",
        file: "mail-inbox",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "BellOff",
    lucideKey: "BellOff",
    context: "Mute thread",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 891,
        code: '<BellOff /> {muted ? "Unmute this thread" : "Mute this thread"}',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 1073,
        code: '{muted && <BellOff aria-label="Muted" className="size-3.5 text-muted-foreground" />}',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 290,
        code: '<BellOff className="size-3.5" />',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 312,
        code: '<BellOff /> {paused ? "Paused" : "Pause"} <ChevronDown />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AlertOff",
      file: "alert-off",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AlertSnooze",
        file: "alert-snooze",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SpeakerMute",
        file: "speaker-mute",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChatOff",
        file: "chat-off",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CommentOff",
        file: "comment-off",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Bird",
    lucideKey: "Bird",
    context: "Brand mark in sample data (Fluent has no bird)",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 129,
        code: 'look: { hue: 268, brand: "Kestrel", icon: Bird, org: "Kestrel" },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Airplane",
      file: "airplane",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AnimalRabbit",
        file: "animal-rabbit",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "AnimalTurtle",
        file: "animal-turtle",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "LeafOne",
        file: "leaf-one",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Planet",
        file: "planet",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Blocks",
    lucideKey: "Blocks",
    context: "Adapter logo fallback, status bar",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/AdapterLogo.tsx",
        line: 8,
        code: "return <Blocks className={className} />",
        area: "app"
      },
      {
        file: "chrome/StatusBar.tsx",
        line: 74,
        code: 'icon={<Blocks className="size-3.5" />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AppsAddIn",
      file: "apps-add-in",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PuzzlePiece",
        file: "puzzle-piece",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Cube",
        file: "cube",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BoxMultiple",
        file: "box-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Bookmark",
    lucideKey: "Bookmark",
    context: "Story kind",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 167,
        code: 'return <Bookmark {...props} style={{ ...props.style, color: "var(--canvas-story)" }} />',
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 988,
        code: 'const Icon = board.kind === "page" ? Route : Bookmark',
        area: "exploration"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 84,
        code: "Icon: Bookmark,",
        area: "exploration"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 196,
        code: 'story: { icon: Bookmark, color: "var(--canvas-story)", word: "Story" },',
        area: "exploration"
      },
      {
        file: "lenses/stories.tsx",
        line: 20,
        code: "Icon: Bookmark,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Bookmark",
      file: "bookmark",
      sizes: [12, 16, 20, 24, 28, 32],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "BookmarkMultiple",
        file: "bookmark-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Tag",
        file: "tag",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BookStar",
        file: "book-star",
        sizes: [20, 24],
        unsized: true,
        color: true
      },
      {
        name: "Star",
        file: "star",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "BookOpen",
    lucideKey: "BookOpen",
    context: "Open in Storybook, docs",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/canvas-container/model.ts",
        line: 43,
        code: 'const openInStorybook = { label: "Open in Storybook", icon: BookOpen }',
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 211,
        code: '<BookOpen className="size-4 shrink-0" />',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 463,
        code: "<BookOpen /> Docs",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "BookOpen",
      file: "book-open",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Book",
        file: "book",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BookOpenLightbulb",
        file: "book-open-lightbulb",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Notebook",
        file: "notebook",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "BookOpenGlobe",
        file: "book-open-globe",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Bot",
    lucideKey: "Bot",
    context: "Agent rows, give to your agent",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/portal/admin.tsx",
        line: 773,
        code: "<Consequence icon={<Bot />}>",
        area: "exploration"
      },
      {
        file: "explorations/portal/inspect.tsx",
        line: 368,
        code: "<Bot /> Give to your agent",
        area: "exploration"
      },
      {
        file: "explorations/portal/library.tsx",
        line: 219,
        code: "<Bot /> Give the update to your agent",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Bot",
      file: "bot",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "BotSparkle",
        file: "bot-sparkle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Agents",
        file: "agents",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BotAdd",
        file: "bot-add",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Sparkle",
        file: "sparkle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Boxes",
    lucideKey: "Boxes",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 220,
        code: 'look: { hue: 255, brand: "Kestrel UI", icon: Boxes, org: "Kestrel" },',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 583,
        code: "look: starter(255, Boxes),",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 357,
        code: '{ label: "Apps", icon: Boxes },',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 620,
        code: '<Boxes className="size-3.5" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 759,
        code: '{ label: "Apps", icon: Boxes },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "BoxMultiple",
      file: "box-multiple",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Box",
        file: "box",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CubeMultiple",
        file: "cube-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CubeTree",
        file: "cube-tree",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Braces",
    lucideKey: "Braces",
    context: "Typecheck process, code props",
    areas: ["app"],
    files: 5,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 63,
        code: 'typecheck: { icon: Braces, tint: "oklch(0.66 0.15 230)", role: "Checks types" },',
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 47,
        code: "json: Braces,",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 48,
        code: "any: Braces,",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 180,
        code: "icon: Braces,",
        area: "app"
      },
      {
        file: "inspector/controls/filter-list.tsx",
        line: 651,
        code: '<Braces aria-label="Custom" className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "inspector/controls/instance-section.tsx",
        line: 48,
        code: "value: Braces,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Braces",
      file: "braces",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BracesCheckmark",
        file: "braces-checkmark",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "BracesVariable",
        file: "braces-variable",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "Code",
        file: "code",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "CodeBlock",
        file: "code-block",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Bug",
    lucideKey: "Bug",
    context: "Developer menu, extension log",
    areas: ["app", "exploration"],
    files: 3,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 356,
        code: "<Bug /> Developer",
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 200,
        code: 'icon: <Bug className="size-3.5 text-muted-foreground" />,',
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 394,
        code: "<Bug /> Developer",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Bug",
      file: "bug",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BugArrowCounterclockwise",
        file: "bug-arrow-counterclockwise",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "WindowDevTools",
        file: "window-dev-tools",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Wrench",
        file: "wrench",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "DeveloperBoard",
        file: "developer-board",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Building2",
    lucideKey: "BuildingComplex",
    context: "Organization access",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 302,
        code: '{access === "organization" ? <Building2 className="size-3.5" /> : <Lock className="size-3.5" />}',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 319,
        code: "<Building2 /> Anyone at Buildkit",
        area: "exploration"
      },
      {
        file: "explorations/portal/share.tsx",
        line: 148,
        code: '<Building2 className="size-3.5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Building",
      file: "building",
      sizes: [16, 20, 24, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "BuildingMultiple",
        file: "building-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "Organization",
        file: "organization",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BuildingPeople",
        file: "building-people",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "BuildingSkyscraper",
        file: "building-skyscraper",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Calendar",
    lucideKey: "Calendar",
    context: "Calendar element kind",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 47,
        code: "calendar: Calendar,",
        area: "app"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 620,
        code: '<Calendar className="size-4" /> Schedule',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 865,
        code: '{ label: "Walks", icon: Calendar },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Calendar",
      file: "calendar",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CalendarLtr",
        file: "calendar-ltr",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CalendarMonth",
        file: "calendar-month",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "CalendarDay",
        file: "calendar-day",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "CalendarEmpty",
        file: "calendar-empty",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Camera",
    lucideKey: "Camera",
    context: "Screenshot in comments, agent camera",
    areas: ["exploration", "app"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 691,
        code: "<Camera />",
        area: "exploration"
      },
      {
        file: "packages/presence-ui/src/AgentPointer.tsx",
        line: 96,
        code: "screenshot: Camera,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Camera",
      file: "camera",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Screenshot",
        file: "screenshot",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "CameraAdd",
        file: "camera-add",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "ScreenshotRecord",
        file: "screenshot-record",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ImageAdd",
        file: "image-add",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CaseSensitive",
    lucideKey: "CaseSensitive",
    context: "Text case field",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/preset-text.tsx",
        line: 317,
        code: 'inner={<CaseSensitive aria-hidden className="size-3.5" />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextCaseTitle",
      file: "text-case-title",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextCaseUppercase",
        file: "text-case-uppercase",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextCaseLowercase",
        file: "text-case-lowercase",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextChangeCase",
        file: "text-change-case",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextFont",
        file: "text-font",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ChartColumn",
    lucideKey: "ChartColumn",
    context: "Chart annotation",
    areas: ["app", "story"],
    files: 2,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 194,
        code: "icon: ChartColumn,",
        area: "app"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 31,
        code: '{ name: "Chart", icon: ChartColumn, depth: 1, selectedBy: [jonas, priya, codex, sam] },',
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DataBarVertical",
      file: "data-bar-vertical",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DataHistogram",
        file: "data-histogram",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DataBarVerticalAscending",
        file: "data-bar-vertical-ascending",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: true
      },
      {
        name: "ChartMultiple",
        file: "chart-multiple",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "DataArea",
        file: "data-area",
        sizes: [20, 24, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Check",
    lucideKey: "Check",
    context: "Checked menu items, done states",
    areas: ["app", "exploration", "story"],
    files: 34,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 159,
        code: '{checked && <Check className="text-foreground" />}',
        area: "app"
      },
      {
        file: "chrome/AppMenu.tsx",
        line: 374,
        code: "<RefreshCw /> Check for updates",
        area: "app"
      },
      {
        file: "chrome/CanvasMenu.tsx",
        line: 315,
        code: '{choice.selected && <CheckIcon className="size-3.5" aria-label="Selected" />}',
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 89,
        code: '<Check className="size-3.5" /> {status.text === text ? "Copied" : `Copied ${status.text}`}',
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 143,
        code: "<Check",
        area: "app"
      },
      {
        file: "chrome/ErrorPage.tsx",
        line: 65,
        code: '{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}',
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 353,
        code: "<Check",
        area: "app"
      },
      {
        file: "chrome/settings/SettingsView.tsx",
        line: 215,
        code: '<Check className="size-3.5" aria-hidden />',
        area: "app"
      }
    ],
    moreSites: 55,
    fluent: {
      name: "Checkmark",
      file: "checkmark",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CheckmarkCircle",
        file: "checkmark-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "CheckmarkSquare",
        file: "checkmark-square",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CheckmarkStarburst",
        file: "checkmark-starburst",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CheckboxChecked",
        file: "checkbox-checked",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ChevronDown",
    lucideKey: "ChevronDown",
    context: "Dropdown triggers, disclosure",
    areas: ["app", "exploration"],
    files: 28,
    sites: [
      {
        file: "canvas/BoardMenus.tsx",
        line: 130,
        code: '<ChevronDown aria-hidden className="-ml-0.5 size-3.5 opacity-60" />',
        area: "app"
      },
      {
        file: "canvas/ContainerView.tsx",
        line: 1145,
        code: '<ChevronDown className="-ml-0.5 size-3 opacity-60" />',
        area: "app"
      },
      {
        file: "canvas/SpacingHandles.tsx",
        line: 444,
        code: '<ChevronDown className="size-3" />',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 227,
        code: '<ChevronDown className="size-3.5 opacity-60" />',
        area: "app"
      },
      {
        file: "chrome/settings/rows.tsx",
        line: 424,
        code: '<ChevronDown className="text-muted-foreground" aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/TitleBar.tsx",
        line: 80,
        code: '<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/TokenDetail.tsx",
        line: 404,
        code: '<ChevronDown className="size-3.5" />',
        area: "app"
      },
      {
        file: "chrome/toolbar-parts.tsx",
        line: 118,
        code: "<ChevronDown />",
        area: "app"
      }
    ],
    moreSites: 26,
    fluent: {
      name: "ChevronDown",
      file: "chevron-down",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChevronCircleDown",
        file: "chevron-circle-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CaretDown",
        file: "caret-down",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleDown",
        file: "chevron-double-down",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowDown",
        file: "arrow-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ChevronLeft",
    lucideKey: "ChevronLeft",
    context: "Previous / back",
    areas: ["exploration", "app"],
    files: 5,
    sites: [
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 265,
        code: "<ChevronLeft />",
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 53,
        code: '<ChevronLeft className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 54,
        code: '<ChevronLeft className="size-6" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 942,
        code: '<ChevronLeft className="size-4 text-(--r-muted)" /> November 2026',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 770,
        code: '<ChevronLeft className="size-6 text-(--r-brand)" />',
        area: "exploration"
      },
      {
        file: "library/LargerView.tsx",
        line: 68,
        code: "<ChevronLeft />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ChevronLeft",
      file: "chevron-left",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CaretLeft",
        file: "caret-left",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronCircleLeft",
        file: "chevron-circle-left",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleLeft",
        file: "chevron-double-left",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowLeft",
        file: "arrow-left",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ChevronRight",
    lucideKey: "ChevronRight",
    context: "Tree disclosure, submenu, next",
    areas: ["app", "exploration"],
    files: 27,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 307,
        code: '<ChevronRight className="size-3.5 transition-transform group-data-[panel-open]/details:rotate-90" />',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 428,
        code: "<ChevronRight",
        area: "app"
      },
      {
        file: "chrome/ApiRoutes.tsx",
        line: 124,
        code: '<ChevronRight className={`size-3.5 transition-transform ${opens?.expanded ? "rotate-90" : ""}`} />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 708,
        code: '<ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 294,
        code: '<ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 382,
        code: '<ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />',
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 229,
        code: '<ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />',
        area: "app"
      },
      {
        file: "chrome/ExtensionView.tsx",
        line: 489,
        code: '<ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />',
        area: "app"
      }
    ],
    moreSites: 26,
    fluent: {
      name: "ChevronRight",
      file: "chevron-right",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CaretRight",
        file: "caret-right",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronCircleRight",
        file: "chevron-circle-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleRight",
        file: "chevron-double-right",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRight",
        file: "arrow-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ChevronsDownUp",
    lucideKey: "ChevronsDownUp",
    context: "Collapse all layers",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/LayerTree.tsx",
        line: 1097,
        code: "<ChevronsDownUp />",
        area: "app"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 386,
        code: "<ChevronsDownUp />",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ChevronDownUp",
      file: "chevron-down-up",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowCollapseAll",
        file: "arrow-collapse-all",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextCollapse",
        file: "text-collapse",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMinimizeVertical",
        file: "arrow-minimize-vertical",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleUp",
        file: "chevron-double-up",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ChevronsUpDown",
    lucideKey: "ChevronsUpDown",
    context: "Select trigger, account switcher",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 45,
        code: '"chevrons-up-down": ChevronsUpDown,',
        area: "app"
      },
      {
        file: "explorations/home/account.tsx",
        line: 140,
        code: '<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 994,
        code: '<ChevronsUpDown className="size-3 opacity-50" />',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 1266,
        code: '<ChevronsUpDown className="size-3.5 text-muted-foreground" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 389,
        code: '<ChevronsUpDown className="size-4 text-(--r-faint)" />',
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 48,
        code: '<ChevronsUpDown className="size-3.5 text-muted-foreground" />',
        area: "exploration"
      },
      {
        file: "start/StartControls.tsx",
        line: 168,
        code: '<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ChevronUpDown",
      file: "chevron-up-down",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowSort",
        file: "arrow-sort",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDown",
        file: "chevron-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CaretDown",
        file: "caret-down",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowBidirectionalUpDown",
        file: "arrow-bidirectional-up-down",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Circle",
    lucideKey: "Circle",
    context: "Project status",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "ProjectStatus.tsx",
        line: 58,
        code: "let Icon = Circle",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Circle",
      file: "circle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "RadioButton",
        file: "radio-button",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleHalfFill",
        file: "circle-half-fill",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleHint",
        file: "circle-hint",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CircleLine",
        file: "circle-line",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CircleAlert",
    lucideKey: "CircleAlert",
    context: "Moderate issue, error notes",
    areas: ["app"],
    files: 5,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 47,
        code: 'moderate: { label: "moderate", icon: CircleAlert, tone: "text-amber-600 dark:text-amber-400" },',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 748,
        code: '<CircleAlert className="size-3.5 shrink-0 text-destructive" aria-label="Fails to draw" />',
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 178,
        code: '<CircleAlert className="mt-0.5 size-3.5 shrink-0" />',
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 226,
        code: 'const statusIcons: Partial<Record<PreviewStatus["kind"], typeof CircleAlert>> = {',
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 227,
        code: "failed: CircleAlert,",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 291,
        code: "const Icon = statusIcons[status.kind] ?? CircleAlert",
        area: "app"
      },
      {
        file: "chrome/ErrorBoundary.tsx",
        line: 459,
        code: '<CircleAlert className="size-3.5 shrink-0 text-destructive" />',
        area: "app"
      },
      {
        file: "inspector/controls/field-parts.tsx",
        line: 837,
        code: 'return <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ErrorCircle",
      file: "error-circle",
      sizes: [12, 16, 20, 24, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Warning",
        file: "warning",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ErrorCircleHint",
        file: "error-circle-hint",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Important",
        file: "important",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ShieldError",
        file: "shield-error",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CircleCheck",
    lucideKey: "CircleCheck",
    context: "Passed / success",
    areas: ["app", "story", "exploration"],
    files: 3,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 336,
        code: '<CircleCheck className="size-5" />',
        area: "app"
      },
      {
        file: "chrome/ToastAudit.stories.tsx",
        line: 1207,
        code: 'success: <CircleCheckIcon aria-hidden="true" />,',
        area: "story"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 487,
        code: 'return <CircleCheck className="size-4 text-(--r-good)" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 739,
        code: '{plan.current && <CircleCheck className="size-5 text-(--r-brand)" />}',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CheckmarkCircle",
      file: "checkmark-circle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CheckmarkCircleHint",
        file: "checkmark-circle-hint",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CheckmarkStarburst",
        file: "checkmark-starburst",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Checkmark",
        file: "checkmark",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ShieldCheckmark",
        file: "shield-checkmark",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "CircleDashed",
    lucideKey: "CircleDashed",
    context: "Still open, missing value",
    areas: ["exploration", "app"],
    files: 3,
    sites: [
      {
        file: "explorations/collaboration/a11y.tsx",
        line: 210,
        code: 'mark = <CircleDashed className="size-3" />',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/a11y.tsx",
        line: 265,
        code: '<CircleDashed className="size-3.5" /> {count("unchecked")}',
        area: "exploration"
      },
      {
        file: "inspector/controls/comparisons.tsx",
        line: 59,
        code: '<CircleDashed aria-label="Still open" className="mt-px size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "inspector/controls/field-parts.tsx",
        line: 861,
        code: '<CircleDashed aria-label={`${name} is missing`} className="size-3.5" />',
        area: "app"
      },
      {
        file: "inspector/controls/field-parts.tsx",
        line: 874,
        code: '<CircleDashed className="size-3.5" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CircleHint",
      file: "circle-hint",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CircleHintHalfVertical",
        file: "circle-hint-half-vertical",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleLine",
        file: "circle-line",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleOff",
        file: "circle-off",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Circle",
        file: "circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CircleDot",
    lucideKey: "CircleDot",
    context: "Radio element kind, node panel",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 43,
        code: '"circle-dot": CircleDot,',
        area: "app"
      },
      {
        file: "chrome/NodePanel.tsx",
        line: 29,
        code: "icon={<CircleDot className={headingIcon} />}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "RadioButton",
      file: "radio-button",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Record",
        file: "record",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "RecordStop",
        file: "record-stop",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CircleSmall",
        file: "circle-small",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Circle",
        file: "circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CircleMinus",
    lucideKey: "CircleMinus",
    context: "Excluded item",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/ConvertToFrameDialog.tsx",
        line: 62,
        code: '<CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/PreviewOffer.tsx",
        line: 145,
        code: '<CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SubtractCircle",
      file: "subtract-circle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Subtract",
        file: "subtract",
        sizes: [12, 16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "Prohibited",
        file: "prohibited",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DismissCircle",
        file: "dismiss-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "CircleOff",
        file: "circle-off",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CircleQuestionMark",
    lucideKey: "CircleQuestionMark",
    context: "Help cursor preview",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 162,
        code: '["help", CircleQuestionMark],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "QuestionCircle",
      file: "question-circle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Question",
        file: "question",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChatHelp",
        file: "chat-help",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BookQuestionMark",
        file: "book-question-mark",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Info",
        file: "info",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CircleX",
    lucideKey: "CircleX",
    context: "Error count, console errors",
    areas: ["app"],
    files: 4,
    sites: [
      {
        file: "canvas/ConsoleBadge.tsx",
        line: 39,
        code: '<CircleX className="size-3.5 text-destructive" /> {errors}',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 214,
        code: 'error: <CircleX className="text-destructive" />,',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 323,
        code: 'icon: <CircleX className="size-3.5 text-destructive" />,',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 479,
        code: '<CircleX className="size-3 text-destructive" /> {errors}',
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 187,
        code: 'icon: <CircleX className="size-3.5 text-destructive" />,',
        area: "app"
      },
      {
        file: "chrome/StatusBar.tsx",
        line: 228,
        code: '<CircleX className="size-3.5 text-destructive" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DismissCircle",
      file: "dismiss-circle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ErrorCircle",
        file: "error-circle",
        sizes: [12, 16, 20, 24, 48],
        unsized: true,
        color: true
      },
      {
        name: "Dismiss",
        file: "dismiss",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Prohibited",
        file: "prohibited",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Warning",
        file: "warning",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "ClipboardPaste",
    lucideKey: "ClipboardPaste",
    context: "Paste",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 74,
        code: "paste: ClipboardPaste,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ClipboardPaste",
      file: "clipboard-paste",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Clipboard",
        file: "clipboard",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ClipboardArrowRight",
        file: "clipboard-arrow-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ClipboardTextLtr",
        file: "clipboard-text-ltr",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "ClipboardMultiple",
        file: "clipboard-multiple",
        sizes: [16],
        unsized: false,
        color: false
      }
    ]
  },
  {
    lucide: "ClipboardPlus",
    lucideKey: "ClipboardPlus",
    context: "Paste over",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 75,
        code: "pasteOver: ClipboardPlus,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ClipboardArrowRight",
      file: "clipboard-arrow-right",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ClipboardTaskAdd",
        file: "clipboard-task-add",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ClipboardMultiple",
        file: "clipboard-multiple",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "LayoutAddAbove",
        file: "layout-add-above",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Clipboard",
        file: "clipboard",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Clock",
    lucideKey: "Clock",
    context: "Recents, pending, emoji recent",
    areas: ["exploration", "app"],
    files: 4,
    sites: [
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 33,
        code: '["recent", Clock],',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notes.tsx",
        line: 183,
        code: '{approved ? <Check className="size-2.5" strokeWidth={3} /> : <Clock className="size-2.5" strokeWidth={2.5} />}',
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 160,
        code: '<NavItem icon={<Clock className="size-4" />} label="Recents" active={active === "recents"} />',
        area: "exploration"
      },
      {
        file: "packages/presence-ui/src/CardHeader.tsx",
        line: 29,
        code: '{away && <Clock className="size-3 shrink-0" />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Clock",
      file: "clock",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "History",
        file: "history",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Timer",
        file: "timer",
        sizes: [10, 12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ClockAlarm",
        file: "clock-alarm",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "CalendarClock",
        file: "calendar-clock",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Code",
    lucideKey: "Code",
    context: "Developer tools, open in editor",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 131,
        code: "developerTools: Code",
        area: "app"
      },
      {
        file: "chrome/SelectionHeading.tsx",
        line: 70,
        code: '"open-in-editor": { label: "Open in editor", icon: <Code /> },',
        area: "app"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 130,
        code: "<Code />",
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 186,
        code: "* the end, Show beside, splits its lens to the right, as VS Code's Open to the Side does.",
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 154,
        code: 'icon={<Code className="size-4" />}',
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 330,
        code: '"Code differs": "oklch(0.7 0.19 30)"',
        area: "exploration"
      },
      {
        file: "media/MediaUses.tsx",
        line: 200,
        code: '<UseGroup title="Code" amount={files.length}>',
        area: "app"
      },
      {
        file: "media/MediaUses.tsx",
        line: 283,
        code: '<Code aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Code",
      file: "code",
      sizes: [16, 20, 24],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CodeBlock",
        file: "code-block",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "WindowDevTools",
        file: "window-dev-tools",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CodeText",
        file: "code-text",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "CodeCircle",
        file: "code-circle",
        sizes: [20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CodeXml",
    lucideKey: "CodeXml",
    context: "Development annotation, code panel",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "collaboration/annotations/annotation-kinds.ts",
        line: 12,
        code: 'development: { name: "Development", icon: CodeXml, hue: 60 }',
        area: "app"
      },
      {
        file: "explorations/code-panel/CodePanel.tsx",
        line: 120,
        code: "<CodeXml />",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Code",
      file: "code",
      sizes: [16, 20, 24],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CodeBlock",
        file: "code-block",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "CodeText",
        file: "code-text",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "CodeCircle",
        file: "code-circle",
        sizes: [20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "DocumentCode",
        file: "document-code",
        sizes: [16],
        unsized: false,
        color: false
      }
    ]
  },
  {
    lucide: "Coins",
    lucideKey: "Coins",
    context: "Currency in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 63,
        code: '<Coins className="size-5 text-[oklch(0.85_0.16_85)]" /> 1,240',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 357,
        code: '<Coins className="size-5 text-[oklch(0.85_0.16_85)]" /> 42',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CoinMultiple",
      file: "coin-multiple",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CoinStack",
        file: "coin-stack",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Money",
        file: "money",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Savings",
        file: "savings",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "Wallet",
        file: "wallet",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Columns2",
    lucideKey: "Columns2",
    context: "Split right, page links",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/PageLinks.tsx",
        line: 59,
        code: "<Columns2 />",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 339,
        code: '<Columns2 /> {lens ? `Split ${lens.name} right` : "Split right"}',
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 227,
        code: "<Columns2 />",
        area: "exploration"
      },
      {
        file: "lenses/LensBar.tsx",
        line: 160,
        code: "<Columns2 /> Split right",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LayoutColumnTwo",
      file: "layout-column-two",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SplitVertical",
        file: "split-vertical",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ColumnDoubleCompare",
        file: "column-double-compare",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "LayoutColumnTwoSplitRight",
        file: "layout-column-two-split-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PanelRight",
        file: "panel-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Columns3",
    lucideKey: "Columns3",
    context: "Row layout (children side by side)",
    areas: ["app", "story"],
    files: 6,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 233,
        code: 'return node.style?.flexDirection === "row" ? <Columns3 {...props} /> : <Rows3 {...props} />',
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 98,
        code: "icon: Columns3,",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 71,
        code: 'const Icon = node.style?.flexDirection === "row" ? Columns3 : Rows3',
        area: "app"
      },
      {
        file: "inspector/controls/grid-cell.tsx",
        line: 212,
        code: '{across ? <Columns3 className="size-3.5" /> : <Rows3 className="size-3.5" />}',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1077,
        code: 'inner={columns ? <Columns3 className="size-3" /> : <Rows3 className="size-3" />}',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1162,
        code: 'inner={columns ? <Columns3 className="size-3" /> : <Rows3 className="size-3" />}',
        area: "app"
      },
      {
        file: "inspector/controls/SlotPicker.stories.tsx",
        line: 16,
        code: "const row = icon(Columns3, kindColors.layer)",
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LayoutColumnThree",
      file: "layout-column-three",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ColumnTriple",
        file: "column-triple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayoutColumnFour",
        file: "layout-column-four",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Column",
        file: "column",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextColumnThree",
        file: "text-column-three",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Compass",
    lucideKey: "Compass",
    context: "Explore nav in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 863,
        code: '{ label: "Explore", icon: Compass },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CompassNorthwest",
      file: "compass-northwest",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CompassTrueNorth",
        file: "compass-true-north",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Globe",
        file: "globe",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Map",
        file: "map",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Location",
        file: "location",
        sizes: [12, 16, 20, 24, 28, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Component",
    lucideKey: "Component",
    context: "Component kind",
    areas: ["app", "story", "exploration"],
    files: 21,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 152,
        code: "* Each kind's icon: AppWindow for a screen, Component for a component, and Figma's frame glyph for a frame. A page of",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 178,
        code: 'return kind === "component" ? <Component {...props} /> : <AppWindow {...props} />',
        area: "app"
      },
      {
        file: "chrome/AddLibraryDialog/Families.tsx",
        line: 9,
        code: '<SectionHeading id="library-components" icon={Component} title="Components" count={total} />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 246,
        code: 'const icon = <Component className="size-3.5" style={{ color: kindColors.component }} />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 744,
        code: '<Component className="size-3.5 shrink-0" style={{ color: kindColors.component }} />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1199,
        code: 'aria-label="Component libraries"',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 91,
        code: "newComponent: Component,",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.stories.tsx",
        line: 39,
        code: 'title: "Parity/Left panel/Component card",',
        area: "story"
      }
    ],
    moreSites: 20,
    fluent: {
      name: "Cube",
      file: "cube",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "PuzzleCube",
        file: "puzzle-cube",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CubeMultiple",
        file: "cube-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Shapes",
        file: "shapes",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Contrast",
    lucideKey: "Contrast",
    context: "Opacity and blend field",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/opacity-blend.tsx",
        line: 40,
        code: 'inner={<Contrast aria-hidden className="size-3.5" />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TransparencySquare",
      file: "transparency-square",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CircleHalfFill",
        file: "circle-half-fill",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Drop",
        file: "drop",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Blur",
        file: "blur",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DarkTheme",
        file: "dark-theme",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Copy",
    lucideKey: "Copy",
    context: "Copy to clipboard",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 316,
        code: 'aria-label="Copy the details"',
        area: "app"
      },
      {
        file: "account/SignInPanels.tsx",
        line: 320,
        code: "<Copy />",
        area: "app"
      },
      {
        file: "chrome/AboutDialog.tsx",
        line: 146,
        code: "<Copy /> Copy details",
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 73,
        code: "copy: Copy,",
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 96,
        code: '* refuses, then back, and its tooltip says which. With `children` it\'s a labeled button, such as "Copy", whose word',
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 102,
        code: "label = `Copy ${text}`,",
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 141,
        code: '<Copy className={`duration-150 ${done ? "scale-50 opacity-0" : ""}`} />',
        area: "app"
      },
      {
        file: "chrome/ErrorPage.tsx",
        line: 65,
        code: '{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}',
        area: "app"
      }
    ],
    moreSites: 8,
    fluent: {
      name: "Copy",
      file: "copy",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DocumentCopy",
        file: "document-copy",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "CopySelect",
        file: "copy-select",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CopyArrowRight",
        file: "copy-arrow-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SquareMultiple",
        file: "square-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CopyPlus",
    lucideKey: "CopyPlus",
    context: "Duplicate",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 77,
        code: "duplicate: CopyPlus,",
        area: "app"
      },
      {
        file: "explorations/start/page.tsx",
        line: 717,
        code: "<CopyPlus /> New project from this",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AddSquareMultiple",
      file: "add-square-multiple",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CopyAdd",
        file: "copy-add",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Copy",
        file: "copy",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SquareMultiple",
        file: "square-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentCopy",
        file: "document-copy",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CornerDownLeft",
    lucideKey: "CornerDownLeft",
    context: "Layout: wrap",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 71,
        code: "icon: <CornerDownLeft />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextWrap",
      file: "text-wrap",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowWrap",
        file: "arrow-wrap",
        sizes: [20, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowEnterLeft",
        file: "arrow-enter-left",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowTurnDownLeft",
        file: "arrow-turn-down-left",
        sizes: [20, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowReply",
        file: "arrow-reply",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CornerDownRight",
    lucideKey: "CornerDownRight",
    context: "Nested item, child route",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "canvas/PageLinksUtil.tsx",
        line: 307,
        code: '<CornerDownRight className="size-3.5" />',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1325,
        code: '<CornerDownRight aria-hidden className="size-3" />',
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 1761,
        code: '<CornerDownRight className="size-3" aria-hidden />',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/approvals.tsx",
        line: 92,
        code: '<CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "RowChild",
      file: "row-child",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowTurnDownRight",
        file: "arrow-turn-down-right",
        sizes: [20, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowHookDownRight",
        file: "arrow-hook-down-right",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowEnter",
        file: "arrow-enter",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "TextBulletListTree",
        file: "text-bullet-list-tree",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "CreditCard",
    lucideKey: "CreditCard",
    context: "Billing",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/portal/admin.tsx",
        line: 469,
        code: '<CreditCard className="size-5 text-muted-foreground" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 361,
        code: '{ label: "Billing", icon: CreditCard },',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 761,
        code: '{ label: "Billing", icon: CreditCard }',
        area: "exploration"
      },
      {
        file: "explorations/start/search.tsx",
        line: 41,
        code: '{ label: "Billing and seats", icon: CreditCard },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Payment",
      file: "payment",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "WalletCreditCard",
        file: "wallet-credit-card",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CreditCardPerson",
        file: "credit-card-person",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Wallet",
        file: "wallet",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Receipt",
        file: "receipt",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Crosshair",
    lucideKey: "Crosshair",
    context: "Crosshair cursor, inspect",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 163,
        code: '["crosshair", Crosshair],',
        area: "app"
      },
      {
        file: "explorations/code-panel/CodePanel.tsx",
        line: 137,
        code: "<Crosshair /> Inspect",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 368,
        code: "icon: Crosshair,",
        area: "exploration"
      },
      {
        file: "inspector/controls/pin-box.tsx",
        line: 29,
        code: '{ value: "absolute", label: "Absolute", detail: "Placed against its parent, out of the layout", Icon: Crosshair },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Target",
      file: "target",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LocationTargetSquare",
        file: "location-target-square",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "MyLocation",
        file: "my-location",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Scan",
        file: "scan",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CenterVertical",
        file: "center-vertical",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Crown",
    lucideKey: "Crown",
    context: "Primary mode marker, make primary",
    areas: ["app", "exploration"],
    files: 3,
    sites: [
      {
        file: "chrome/DesignPanel.tsx",
        line: 307,
        code: '<Crown className="size-3 shrink-0 text-amber-400" aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/ModesPanel.tsx",
        line: 256,
        code: "<Crown /> Make primary",
        area: "app"
      },
      {
        file: "explorations/screen-container/container-panel.tsx",
        line: 305,
        code: '{index === 0 && <Crown className="size-3 shrink-0 text-amber-400" aria-label="Project primary" />}',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Crown",
      file: "crown",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Star",
        file: "star",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Premium",
        file: "premium",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Trophy",
        file: "trophy",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Ribbon",
        file: "ribbon",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Database",
    lucideKey: "Database",
    context: "Data annotation",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 119,
        code: "icon: Database,",
        area: "app"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 95,
        code: "Icon: Database,",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Database",
      file: "database",
      sizes: [16, 20, 24, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "DatabaseStack",
        file: "database-stack",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "DatabaseMultiple",
        file: "database-multiple",
        sizes: [20, 32],
        unsized: true,
        color: false
      },
      {
        name: "Server",
        file: "server",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TableSimple",
        file: "table-simple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Diamond",
    lucideKey: "Diamond",
    context: "Instance kind, go to main component",
    areas: ["app", "exploration", "story"],
    files: 12,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 184,
        code: "* component code or a design, and shows the instance's Diamond. Which libraries are icon sets comes from the",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 212,
        code: "return isIconLayer(node, libraries ?? project?.info.libraries ?? []) ? <Smile {...props} /> : <Diamond {...props} />",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 216,
        code: "return <Diamond {...props} />",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 221,
        code: "return node.component ? <Diamond {...props} /> : <Route {...props} />",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 281,
        code: 'icon: <Diamond className="size-3.5" style={{ color: kindColors.component }} />,',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 742,
        code: '<Diamond className="size-3.5 shrink-0" style={{ color: kindColors.component }} />',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 97,
        code: "goToMain: Diamond,",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 111,
        code: "const Icon = instance ? Diamond : Component",
        area: "app"
      }
    ],
    moreSites: 9,
    fluent: {
      name: "Diamond",
      file: "diamond",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Rhombus",
        file: "rhombus",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DiamondLink",
        file: "diamond-link",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Shapes",
        file: "shapes",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Square",
        file: "square",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "DiamondPlus",
    lucideKey: "DiamondPlus",
    context: "Make component",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 96,
        code: "makeComponent: DiamondPlus,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CubeAdd",
      file: "cube-add",
      sizes: [20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PuzzleCubePiece",
        file: "puzzle-cube-piece",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "AddSquare",
        file: "add-square",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DiamondLink",
        file: "diamond-link",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Add",
        file: "add",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Dog",
    lucideKey: "Dog",
    context: "Sample app image placeholder",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 672,
        code: '<Dog className="size-1/3 text-white/70" strokeWidth={1.5} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AnimalDog",
      file: "animal-dog",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AnimalCat",
        file: "animal-cat",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "AnimalPawPrint",
        file: "animal-paw-print",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "AnimalRabbit",
        file: "animal-rabbit",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "Image",
        file: "image",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Download",
    lucideKey: "Download",
    context: "Export, save file",
    areas: ["app", "exploration"],
    files: 8,
    sites: [
      {
        file: "chrome/ExportSection.tsx",
        line: 90,
        code: "<Download /> {label}",
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 103,
        code: '{ id: "export", label: "Export", icon: Download, group: 0 },',
        area: "app"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 117,
        code: "aria-label={`Download ${attachment.name}`}",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 120,
        code: "<Download />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 288,
        code: "<Download /> Download",
        area: "exploration"
      },
      {
        file: "explorations/icon-export/icon-export.tsx",
        line: 97,
        code: "<Download /> Export {iconsOf(library)}",
        area: "exploration"
      },
      {
        file: "explorations/icon-export/icon-export.tsx",
        line: 283,
        code: '<Download /> Export {icons.length === 1 ? "1 icon" : `${icons.length.toLocaleString()} icons`}',
        area: "exploration"
      },
      {
        file: "explorations/portal/activity.tsx",
        line: 179,
        code: '<Download className="size-3" /> Export',
        area: "exploration"
      }
    ],
    moreSites: 5,
    fluent: {
      name: "ArrowDownload",
      file: "arrow-download",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowExport",
        file: "arrow-export",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SaveArrowRight",
        file: "save-arrow-right",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CloudArrowDown",
        file: "cloud-arrow-down",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentArrowDown",
        file: "document-arrow-down",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Ellipsis",
    lucideKey: "Ellipsis",
    context: "More actions menu",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 764,
        code: "<Ellipsis />",
        area: "app"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 285,
        code: "<Ellipsis />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 870,
        code: "<Ellipsis />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 1243,
        code: "<Ellipsis />",
        area: "exploration"
      },
      {
        file: "explorations/portal/changes.tsx",
        line: 613,
        code: "<Ellipsis />",
        area: "exploration"
      },
      {
        file: "explorations/portal/handoff.tsx",
        line: 182,
        code: "<Ellipsis />",
        area: "exploration"
      },
      {
        file: "explorations/portal/handoff.tsx",
        line: 226,
        code: "<Ellipsis />",
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 701,
        code: "<Ellipsis />",
        area: "exploration"
      }
    ],
    moreSites: 2,
    fluent: {
      name: "MoreHorizontal",
      file: "more-horizontal",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "MoreVertical",
        file: "more-vertical",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "MoreCircle",
        file: "more-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Options",
        file: "options",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "TextMore",
        file: "text-more",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ExternalLink",
    lucideKey: "ExternalLink",
    context: "Open in browser or window",
    areas: ["app", "exploration"],
    files: 14,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 261,
        code: "<ExternalLink /> Open it again",
        area: "app"
      },
      {
        file: "canvas/ReferenceUtil.tsx",
        line: 128,
        code: "<ExternalLink /> Open in {source}",
        area: "app"
      },
      {
        file: "chrome/OfferMenuItems.tsx",
        line: 32,
        code: "{page ? <ExternalLink /> : <AdapterLogo logo={command.icon} />}",
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 521,
        code: "<ExternalLink />",
        area: "app"
      },
      {
        file: "chrome/ReferencePanel.tsx",
        line: 72,
        code: "<ExternalLink /> Open in {source}",
        area: "app"
      },
      {
        file: "chrome/SelectionHeading.tsx",
        line: 106,
        code: "{page ? <ExternalLink /> : <AdapterLogo logo={command.icon} />}",
        area: "app"
      },
      {
        file: "explorations/canvas-container/model.ts",
        line: 42,
        code: 'const openInBrowser = { label: "Open in browser", icon: ExternalLink }',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/issues.tsx",
        line: 117,
        code: "<ExternalLink />",
        area: "exploration"
      }
    ],
    moreSites: 7,
    fluent: {
      name: "Open",
      file: "open",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "WindowNew",
        file: "window-new",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowUpRight",
        file: "arrow-up-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LinkSquare",
        file: "link-square",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShareIos",
        file: "share-ios",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Eye",
    lucideKey: "Eye",
    context: "Show, visible",
    areas: ["app", "exploration"],
    files: 11,
    sites: [
      {
        file: "chrome/LayerPanel.tsx",
        line: 553,
        code: "{node.hidden ? <EyeOff /> : <Eye />}",
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1729,
        code: '{hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}',
        area: "app"
      },
      {
        file: "explorations/collaboration/live-board.tsx",
        line: 330,
        code: '<Eye /> Resolved <span className="text-muted-foreground tabular-nums">{resolved}</span>',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 141,
        code: 'review: { verb: "asked you to review", icon: Eye, color: "oklch(0.78 0.14 75)" },',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/pins.tsx",
        line: 255,
        code: "<Eye /> Resolved",
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 20,
        code: "review: Eye,",
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 160,
        code: "review: Eye,",
        area: "exploration"
      },
      {
        file: "inspector/controls/list-parts.tsx",
        line: 258,
        code: "{off ? <EyeOff /> : <Eye />}",
        area: "app"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "Eye",
      file: "eye",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "EyeLines",
        file: "eye-lines",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "EyeCircle",
        file: "eye-circle",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Glasses",
        file: "glasses",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "EyeTracking",
        file: "eye-tracking",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "EyeOff",
    lucideKey: "EyeOff",
    context: "Hide, hidden",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 103,
        code: "hide: EyeOff,",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 231,
        code: '"draws-nothing": EyeOff',
        area: "app"
      },
      {
        file: "chrome/LayerPanel.tsx",
        line: 553,
        code: "{node.hidden ? <EyeOff /> : <Eye />}",
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1729,
        code: '{hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}',
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 169,
        code: '["none", EyeOff]',
        area: "app"
      },
      {
        file: "explorations/screen-container/container-layers.tsx",
        line: 330,
        code: '{hidden && <EyeOff className="size-3" aria-label="Hidden" />}',
        area: "exploration"
      },
      {
        file: "inspector/controls/list-parts.tsx",
        line: 258,
        code: "{off ? <EyeOff /> : <Eye />}",
        area: "app"
      },
      {
        file: "packages/presence-ui/src/FollowLayer.tsx",
        line: 54,
        code: '{state === "stopped" && <FollowEnded icon={EyeOff} title={`Stopped following ${shortName(leader)}`} />}',
        area: "app"
      }
    ],
    moreSites: 1,
    fluent: {
      name: "EyeOff",
      file: "eye-off",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "GlassesOff",
        file: "glasses-off",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "EyeTrackingOff",
        file: "eye-tracking-off",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SlideHide",
        file: "slide-hide",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Eye",
        file: "eye",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "File",
    lucideKey: "File",
    context: "Generic attachment",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 63,
        code: 'return { label: extension ? extension.toUpperCase() : "File", icon: File }',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 299,
        code: "export function fromFiles(files: ArrayLike<File>): Attachment[] {",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Document",
      file: "document",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "DocumentOnePage",
        file: "document-one-page",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentText",
        file: "document-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Attach",
        file: "attach",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentBorder",
        file: "document-border",
        sizes: [20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FileArchive",
    lucideKey: "FileArchive",
    context: "Archive attachment",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 41,
        code: '{ match: /\\.(zip|tar|gz|7z)$/i, label: "Archive", icon: FileArchive, hue: 80 },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "FolderZip",
      file: "folder-zip",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Archive",
        file: "archive",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArchiveMultiple",
        file: "archive-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BoxMultiple",
        file: "box-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Document",
        file: "document",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "FileCode",
    lucideKey: "FileCode",
    context: "Source file",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/CanvasMenu.tsx",
        line: 239,
        code: "<FileCode />",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 194,
        code: "<FileCode />",
        area: "app"
      },
      {
        file: "chrome/ComponentMenu.tsx",
        line: 58,
        code: "<FileCode /> View code",
        area: "app"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 43,
        code: '{ match: /\\.(json|ts|tsx|js|jsx|css|html|svg)$/i, label: "Code", icon: FileCode, hue: 200 }',
        area: "exploration"
      },
      {
        file: "explorations/portal/inspect.tsx",
        line: 166,
        code: '<FileCode className="size-3.5 shrink-0" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DocumentCode",
      file: "document-code",
      sizes: [16],
      unsized: false,
      color: false
    },
    alternatives: [
      {
        name: "DocumentJavascript",
        file: "document-javascript",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DocumentTs",
        file: "document-ts",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "Code",
        file: "code",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "DocumentText",
        file: "document-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "FileCode2",
    lucideKey: "FileCodeCorner",
    context: "Code panel source",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/code-panel/CodePanel.tsx",
        line: 178,
        code: "{source?.library ? <Package /> : <FileCode2 style={{ color: kindColors.component }} />}",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DocumentCode",
      file: "document-code",
      sizes: [16],
      unsized: false,
      color: false
    },
    alternatives: [
      {
        name: "DocumentTs",
        file: "document-ts",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "DocumentJs",
        file: "document-js",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "CodeBlock",
        file: "code-block",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "DocumentJavascript",
        file: "document-javascript",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FileInput",
    lucideKey: "FileInput",
    context: "Open file",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 122,
        code: "openFile: FileInput,",
        area: "app"
      },
      {
        file: "explorations/start/page.tsx",
        line: 1221,
        code: '<FileInput /> Open a project file <DropdownMenuShortcut>{formatKeys("Ctrl Shift O")}</DropdownMenuShortcut>',
        area: "exploration"
      },
      {
        file: "start/HomePage.tsx",
        line: 165,
        code: "<FileInput /> Open a project file",
        area: "app"
      },
      {
        file: "start/HomePage.tsx",
        line: 262,
        code: "icon: FileInput,",
        area: "app"
      },
      {
        file: "start/StartControls.tsx",
        line: 66,
        code: '<FileInput /> Open a project file <DropdownMenuShortcut>{shortcutOf("openFile")}</DropdownMenuShortcut>',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DocumentArrowRight",
      file: "document-arrow-right",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FolderOpen",
        file: "folder-open",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowImport",
        file: "arrow-import",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "DocumentArrowUp",
        file: "document-arrow-up",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Open",
        file: "open",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FileJson",
    lucideKey: "FileBraces",
    context: "Open keybindings.json",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/settings/shortcuts.tsx",
        line: 37,
        code: "<FileJson aria-hidden /> Open keybindings.json",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DocumentData",
      file: "document-data",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Braces",
        file: "braces",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentSettings",
        file: "document-settings",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "DocumentJs",
        file: "document-js",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "DocumentCode",
        file: "document-code",
        sizes: [16],
        unsized: false,
        color: false
      }
    ]
  },
  {
    lucide: "FileSpreadsheet",
    lucideKey: "FileSpreadsheet",
    context: "CSV attachment",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 39,
        code: '{ match: /\\.csv$/i, label: "CSV", icon: FileSpreadsheet, hue: 150 },',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 40,
        code: '{ match: /\\.(xlsx?|numbers)$/i, label: "Spreadsheet", icon: FileSpreadsheet, hue: 150 },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DocumentCsv",
      file: "document-csv",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DocumentTable",
        file: "document-table",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DocumentExcel",
        file: "document-excel",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "TableSimple",
        file: "table-simple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentData",
        file: "document-data",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FileText",
    lucideKey: "FileText",
    context: "PDF attachment",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 37,
        code: '{ match: /\\.pdf$/i, label: "PDF", icon: FileText, hue: 25 },',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 38,
        code: '{ match: /\\.(docx?|pages|rtf|txt|md)$/i, label: "Document", icon: FileText, hue: 255 },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DocumentPdf",
      file: "document-pdf",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DocumentText",
        file: "document-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Document",
        file: "document",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "DocumentOnePage",
        file: "document-one-page",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentBulletList",
        file: "document-bullet-list",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FileVideo",
    lucideKey: "FilePlay",
    context: "Video attachment",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/attachments.tsx",
        line: 42,
        code: '{ match: /\\.(mp4|mov|webm)$/i, label: "Video", icon: FileVideo, hue: 300 },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "VideoClip",
      file: "video-clip",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Video",
        file: "video",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "FilmstripPlay",
        file: "filmstrip-play",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Filmstrip",
        file: "filmstrip",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "VideoShort",
        file: "video-short",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Film",
    lucideKey: "Film",
    context: "Video element kind, media",
    areas: ["app"],
    files: 4,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 53,
        code: "film: Film,",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 208,
        code: "return <Film {...props} />",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 107,
        code: "icon: Film,",
        area: "app"
      },
      {
        file: "media/MediaCard.tsx",
        line: 13,
        code: "export const mediumIcons: Record<ImageMedium, LucideIcon> = { image: ImageIcon, vector: PenTool, video: Film }",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Filmstrip",
      file: "filmstrip",
      sizes: [16, 20, 24, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FilmstripPlay",
        file: "filmstrip-play",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "VideoClip",
        file: "video-clip",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Video",
        file: "video",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "MoviesAndTv",
        file: "movies-and-tv",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Flag",
    lucideKey: "Flag",
    context: "Flag annotation",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 201,
        code: "icon: Flag,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Flag",
      file: "flag",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "FlagCheckered",
        file: "flag-checkered",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "FlagClock",
        file: "flag-clock",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Bookmark",
        file: "bookmark",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Important",
        file: "important",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Flame",
    lucideKey: "Flame",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 164,
        code: 'look: { hue: 34, brand: "Ember Caves", icon: Flame, dark: true },',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 573,
        code: "look: starter(280, Flame, true),",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Fire",
      file: "fire",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Flash",
        file: "flash",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "WeatherSunny",
        file: "weather-sunny",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Lightbulb",
        file: "lightbulb",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Sparkle",
        file: "sparkle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FlaskConical",
    lucideKey: "FlaskConical",
    context: "Test process",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 64,
        code: 'test: { icon: FlaskConical, tint: "oklch(0.72 0.17 140)", role: "Runs unit tests" },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Beaker",
      file: "beaker",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BeakerSettings",
        file: "beaker-settings",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "BeakerEmpty",
        file: "beaker-empty",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "TaskListSquareLtr",
        file: "task-list-square-ltr",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "CheckmarkCircle",
        file: "checkmark-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "FlipHorizontal2",
    lucideKey: "TrianglesCenterlineDashedHorizontal",
    context: "Flip horizontal",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/transform.tsx",
        line: 125,
        code: "<FlipHorizontal2 />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "FlipHorizontal",
      file: "flip-horizontal",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowBidirectionalLeftRight",
        file: "arrow-bidirectional-left-right",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "DualScreenMirror",
        file: "dual-screen-mirror",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSwap",
        file: "arrow-swap",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FlipVertical2",
    lucideKey: "TrianglesCenterlineDashedVertical",
    context: "Flip vertical",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/transform.tsx",
        line: 137,
        code: "<FlipVertical2 />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "FlipVertical",
      file: "flip-vertical",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowBidirectionalUpDown",
        file: "arrow-bidirectional-up-down",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSort",
        file: "arrow-sort",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DualScreenMirror",
        file: "dual-screen-mirror",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSwap",
        file: "arrow-swap",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Folder",
    lucideKey: "Folder",
    context: "Folder layer, project folder",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/LayerTree.tsx",
        line: 1320,
        code: '{!layout && <Folder className="size-3.5 shrink-0" style={iconStyle} />}',
        area: "app"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 980,
        code: "look: { hue: 30, brand: name, icon: Folder },",
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 1016,
        code: '<Folder className="size-4 shrink-0 text-muted-foreground" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Folder",
      file: "folder",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FolderOpen",
        file: "folder-open",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "FolderMultiple",
        file: "folder-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "FolderList",
        file: "folder-list",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "Archive",
        file: "archive",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FolderCode",
    lucideKey: "FolderCode",
    context: "Project folder in console",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/ConsolePanel.tsx",
        line: 302,
        code: '<FolderCode className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Folder",
      file: "folder",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FolderOpen",
        file: "folder-open",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "FolderDocument",
        file: "folder-document",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "FolderList",
        file: "folder-list",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "DocumentFolder",
        file: "document-folder",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "FolderDown",
    lucideKey: "FolderDown",
    context: "Export all",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 208,
        code: "<FolderDown /> Export all…",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 289,
        code: "<FolderDown /> Export all…",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "FolderArrowRight",
      file: "folder-arrow-right",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowDownload",
        file: "arrow-download",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowExport",
        file: "arrow-export",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "FolderArrowUp",
        file: "folder-arrow-up",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SaveMultiple",
        file: "save-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FolderGit2",
    lucideKey: "FolderGit2",
    context: "Git repository",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 389,
        code: "icon: FolderGit2,",
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 874,
        code: "look: { hue: 220, brand: repo.name, icon: FolderGit2 },",
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 883,
        code: '<FolderGit2 className={`size-5 shrink-0 ${usable ? "text-muted-foreground" : "text-muted-foreground/40"}`} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Branch",
      file: "branch",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FolderLink",
        file: "folder-link",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BranchFork",
        file: "branch-fork",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Folder",
        file: "folder",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "FolderSync",
        file: "folder-sync",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FolderOpen",
    lucideKey: "FolderOpen",
    context: "Open project",
    areas: ["app", "exploration"],
    files: 13,
    sites: [
      {
        file: "chrome/ActionsSearch.tsx",
        line: 380,
        code: 'icon: <FolderOpen className="text-muted-foreground" />,',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 121,
        code: "openFolder: FolderOpen,",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 140,
        code: "<FolderOpen /> Open project folder…",
        area: "exploration"
      },
      {
        file: "explorations/portal/admin.tsx",
        line: 768,
        code: "<Consequence icon={<FolderOpen />}>",
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 161,
        code: '<NavItem icon={<FolderOpen className="size-4" />} label="All projects" active={active === "projects"} />',
        area: "exploration"
      },
      {
        file: "explorations/start/first-run.tsx",
        line: 42,
        code: '{ id: "folder", mark: <FolderOpen className="size-4" />, name: "A folder on this computer" }',
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 709,
        code: 'icon: <FolderOpen className="size-4" />,',
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 1001,
        code: '<FolderOpen className="size-7" />',
        area: "exploration"
      }
    ],
    moreSites: 12,
    fluent: {
      name: "FolderOpen",
      file: "folder-open",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Folder",
        file: "folder",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "FolderOpenVertical",
        file: "folder-open-vertical",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "OpenFolder",
        file: "open-folder",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "FolderArrowUp",
        file: "folder-arrow-up",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "FolderX",
    lucideKey: "FolderX",
    context: "Folder not found",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "start/ProjectCard.tsx",
        line: 135,
        code: '<FolderX className="size-3" /> Folder not found',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "FolderDismiss",
      file: "folder-dismiss",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FolderProhibited",
        file: "folder-prohibited",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "FolderSearch",
        file: "folder-search",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "FolderOpen",
        file: "folder-open",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Warning",
        file: "warning",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Frame",
    lucideKey: "Frame",
    context: "Frame kind and tool, Canvas settings",
    areas: ["app", "exploration", "story"],
    files: 5,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 175,
        code: "return <Frame {...props} />",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/tool-details.ts",
        line: 8,
        code: "frame: Frame,",
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 102,
        code: '{ id: "canvas", label: "Canvas", icon: Frame, group: 0 },',
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 245,
        code: 'detail: "Frame rate, memory and CPU in the status bar.",',
        area: "app"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 195,
        code: 'const layerIcons: Record<"frame" | "text" | "instance", LucideIcon> = { frame: Frame, text: Type, instance: Diamond }',
        area: "exploration"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 24,
        code: '{ name: "Dashboard", icon: Frame, depth: 0 },',
        area: "story"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 25,
        code: '{ name: "Header", icon: Frame, depth: 1 },',
        area: "story"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 27,
        code: '{ name: "Stats", icon: Frame, depth: 1 },',
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Frame",
      file: "frame",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SquareHint",
        file: "square-hint",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BorderOutside",
        file: "border-outside",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Crop",
        file: "crop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ResizeLarge",
        file: "resize-large",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Gamepad2",
    lucideKey: "Gamepad2",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 553,
        code: "look: starter(34, Gamepad2, true),",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Games",
      file: "games",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "XboxController",
        file: "xbox-controller",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Joystick",
        file: "joystick",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "Trophy",
        file: "trophy",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BoardGames",
        file: "board-games",
        sizes: [20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Gauge",
    lucideKey: "Gauge",
    context: "Performance stats",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 361,
        code: "icon={Gauge}",
        area: "app"
      },
      {
        file: "chrome/PerformanceStats.tsx",
        line: 65,
        code: '<Gauge className="size-3.5" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Gauge",
      file: "gauge",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "TopSpeed",
        file: "top-speed",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DataUsage",
        file: "data-usage",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Pulse",
        file: "pulse",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowTrending",
        file: "arrow-trending",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Gem",
    lucideKey: "Gem",
    context: "Currency in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 66,
        code: '<Gem className="size-5 text-[oklch(0.8_0.13_200)]" /> 36',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Diamond",
      file: "diamond",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Premium",
        file: "premium",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Star",
        file: "star",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Crown",
        file: "crown",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CoinMultiple",
        file: "coin-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "GitBranch",
    lucideKey: "GitBranch",
    context: "Branch name",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/portal/changes.tsx",
        line: 633,
        code: '<GitBranch /> <span className="truncate font-mono text-xs">{code.branch}</span>',
        area: "exploration"
      },
      {
        file: "explorations/portal/handoff.tsx",
        line: 370,
        code: '<GitBranch className="size-3.5" /> Branches and pull requests show where a project has them',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Branch",
      file: "branch",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BranchFork",
        file: "branch-fork",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "BranchCompare",
        file: "branch-compare",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BranchRequest",
        file: "branch-request",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSplit",
        file: "arrow-split",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "GitMerge",
    lucideKey: "GitMerge",
    context: "Merge activity",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/portal/activity.tsx",
        line: 123,
        code: '<GitMerge className="size-4 text-[oklch(0.7_0.16_300)]" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 21,
        code: "merge: GitMerge,",
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 161,
        code: "merge: GitMerge,",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "BranchFork",
      file: "branch-fork",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BranchCompare",
        file: "branch-compare",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowJoin",
        file: "arrow-join",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "Merge",
        file: "merge",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowFlowUpRight",
        file: "arrow-flow-up-right",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "GitPullRequest",
    lucideKey: "GitPullRequest",
    context: "Pull request",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/portal/changes.tsx",
        line: 636,
        code: "<GitPullRequest /> Pull request #{code.pr.number}, {code.pr.state}",
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 352,
        code: '<GitPullRequest className="size-3.5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "BranchRequest",
      file: "branch-request",
      sizes: [16, 20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BranchRequestDraft",
        file: "branch-request-draft",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "BranchRequestClosed",
        file: "branch-request-closed",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "BranchCompare",
        file: "branch-compare",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BranchFork",
        file: "branch-fork",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Grid2x2",
    lucideKey: "Grid2x2",
    context: "Story kind",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 171,
        code: 'return <Grid2x2 {...props} style={{ ...props.style, color: "var(--canvas-story)" }} />',
        area: "app"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 197,
        code: '"story-file": { icon: Grid2x2, color: "var(--canvas-story)", word: "Stories" },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Grid",
      file: "grid",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "GridKanban",
        file: "grid-kanban",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "LayoutCellFour",
        file: "layout-cell-four",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BorderAll",
        file: "border-all",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Grid3x3",
    lucideKey: "Grid3x3",
    context: "Layout grid toggle, grid kind",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 230,
        code: "return <Grid3x3 {...props} />",
        area: "app"
      },
      {
        file: "chrome/AppMenu.tsx",
        line: 283,
        code: "icon={Grid3x3}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "BorderAll",
      file: "border-all",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Table",
        file: "table",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "TableSimple",
        file: "table-simple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "GridDots",
        file: "grid-dots",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "LayoutColumnFour",
        file: "layout-column-four",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "GripVertical",
    lucideKey: "GripVertical",
    context: "Drag handle",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/ShowList.tsx",
        line: 93,
        code: '<GripVertical className="size-3" />',
        area: "app"
      },
      {
        file: "explorations/canvas-container/view-lists.tsx",
        line: 226,
        code: '<GripVertical className="size-3" />',
        area: "exploration"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1416,
        code: '<GripVertical className="size-3" />',
        area: "app"
      },
      {
        file: "inspector/controls/list-parts.tsx",
        line: 209,
        code: '<GripVertical className="size-3" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ReOrderDotsVertical",
      file: "re-order-dots-vertical",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ReOrderDotsHorizontal",
        file: "re-order-dots-horizontal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ReOrder",
        file: "re-order",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ReOrderVertical",
        file: "re-order-vertical",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "GridDots",
        file: "grid-dots",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Group",
    lucideKey: "Group",
    context: "Wrap in layout",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 94,
        code: "wrap: Group,",
        area: "app"
      },
      {
        file: "chrome/LayerPanel.tsx",
        line: 593,
        code: '<Group /> {keymap.wrap.label} <Kbd className="ml-auto">{shortcutOf("wrap")}</Kbd>',
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 159,
        code: '<Group /> {keymap.wrap.label} <Kbd className="ml-auto">{shortcutOf("wrap")}</Kbd>',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Group",
      file: "group",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SquareMultiple",
        file: "square-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "GroupList",
        file: "group-list",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayerDiagonal",
        file: "layer-diagonal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SelectObject",
        file: "select-object",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Hammer",
    lucideKey: "Hammer",
    context: "Build process",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 59,
        code: "const kinds: Record<ProcessRole, { icon: typeof Hammer; tint: string; role: string }> = {",
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 68,
        code: 'build: { icon: Hammer, tint: "oklch(0.68 0.03 260)", role: "Builds the project" },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Wrench",
      file: "wrench",
      sizes: [16, 20, 24],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "WrenchScrewdriver",
        file: "wrench-screwdriver",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Toolbox",
        file: "toolbox",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "BuildingFactory",
        file: "building-factory",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Settings",
        file: "settings",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Hand",
    lucideKey: "Hand",
    context: "Hand tool, grab cursor, emoji people",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/FloatingToolbar/tool-details.ts",
        line: 7,
        code: "hand: Hand,",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/tool-details.ts",
        line: 23,
        code: "* The tools that decide what the pointer does, in their menu's order. They share a button, as Figma's Move holds Hand",
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 160,
        code: '["grab", Hand],',
        area: "app"
      },
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 35,
        code: '["people", Hand],',
        area: "exploration"
      },
      {
        file: "explorations/portal/activity.tsx",
        line: 167,
        code: "<Hand /> Say hello",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "HandRight",
      file: "hand-right",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "HandLeft",
        file: "hand-left",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "HandWave",
        file: "hand-wave",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "HandDraw",
        file: "hand-draw",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "HandMultiple",
        file: "hand-multiple",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "HandGrab",
    lucideKey: "HandGrab",
    context: "Grabbing cursor preview",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 161,
        code: '["grabbing", HandGrab],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "HandLeft",
      file: "hand-left",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Drag",
        file: "drag",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMove",
        file: "arrow-move",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "HandRight",
        file: "hand-right",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "HandDraw",
        file: "hand-draw",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "HardDrive",
    lucideKey: "HardDrive",
    context: "Local storage",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/parts.tsx",
        line: 346,
        code: "return <HardDrive className={className} />",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "HardDrive",
      file: "hard-drive",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Storage",
        file: "storage",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Server",
        file: "server",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Database",
        file: "database",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Save",
        file: "save",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Hash",
    lucideKey: "Hash",
    context: "Number prop",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/slot-props.tsx",
        line: 45,
        code: "number: Hash,",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 104,
        code: '{ type: "number", label: "Number", icon: Hash },',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 133,
        code: "icon: Hash,",
        area: "app"
      },
      {
        file: "inspector/controls/instance-section.tsx",
        line: 46,
        code: "number: Hash,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "NumberSymbol",
      file: "number-symbol",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "NumberSymbolSquare",
        file: "number-symbol-square",
        sizes: [20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "NumberRow",
        file: "number-row",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "NumberCircle1",
        file: "number-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Tag",
        file: "tag",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Heading",
    lucideKey: "LetterH",
    context: "Heading annotation",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 221,
        code: 'title: "Heading",',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 224,
        code: "icon: Heading,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextHeader1",
      file: "text-header",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextHeader1Lines",
        file: "text-header-1-lines",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextHeader2",
        file: "text-header",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextT",
        file: "text-t",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextFont",
        file: "text-font",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Heart",
    lucideKey: "Heart",
    context: "Like, emoji symbols",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 39,
        code: '["symbols", Heart]',
        area: "exploration"
      },
      {
        file: "explorations/portal/ingame-render.tsx",
        line: 18,
        code: "<Heart",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 69,
        code: '<Heart className="size-5 fill-[oklch(0.68_0.22_25)] text-[oklch(0.68_0.22_25)]" /> 5',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 344,
        code: "<Heart",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 742,
        code: '<Heart className="absolute top-3 right-3 size-5 text-white drop-shadow" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 864,
        code: '{ label: "Saved", icon: Heart },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Heart",
      file: "heart",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "HeartCircle",
        file: "heart-circle",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ThumbLike",
        file: "thumb-like",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "Star",
        file: "star",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Emoji",
        file: "emoji",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "HeartPulse",
    lucideKey: "HeartPulse",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 192,
        code: 'look: { hue: 150, brand: "Kestrel Status", icon: HeartPulse, org: "Kestrel" },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "HeartPulse",
      file: "heart-pulse",
      sizes: [20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Heart",
        file: "heart",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Pulse",
        file: "pulse",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "Stethoscope",
        file: "stethoscope",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "HeartCircle",
        file: "heart-circle",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "History",
    lucideKey: "RotateCcwClock",
    context: "Open recent, history",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 178,
        code: "<History /> Open recent",
        area: "app"
      },
      {
        file: "chrome/AppMenu.tsx",
        line: 224,
        code: "/** History, the clipboard, copying pictures and styles, then what changes or selects what's selected. */",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 268,
        code: "<History /> Open recent",
        area: "exploration"
      },
      {
        file: "explorations/portal/admin.tsx",
        line: 777,
        code: "<Consequence icon={<History />}>",
        area: "exploration"
      },
      {
        file: "library/BrowserStates.tsx",
        line: 57,
        code: "<SearchRow key={query} query={query} icon={<History />} onRun={() => onRun({ query, filters })}>",
        area: "app"
      },
      {
        file: "start/ProjectList.tsx",
        line: 18,
        code: "icon: History,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "History",
      file: "history",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Clock",
        file: "clock",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ArrowCounterclockwise",
        file: "arrow-counterclockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "AppRecent",
        file: "app-recent",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChatHistory",
        file: "chat-history",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "House",
    lucideKey: "House",
    context: "Home",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/parts.tsx",
        line: 74,
        code: '<House className="size-4" aria-label="Home" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 144,
        code: '<NavItem icon={<House className="size-4" />} label="For you" active={active === "home"} />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 758,
        code: '{ label: "Home", icon: House },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Home",
      file: "home",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "HomeEmpty",
        file: "home-empty",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "HomeMore",
        file: "home-more",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Building",
        file: "building",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BuildingHome",
        file: "building-home",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Image",
    lucideKey: "Image",
    context: "Image kind, copy as PNG",
    areas: ["app", "exploration"],
    files: 6,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 51,
        code: "image: Image,",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 20,
        code: "Image as ImageIcon,",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 204,
        code: "return <ImageIcon {...props} />",
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 79,
        code: "copyAsPng: Image,",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 13,
        code: "Image as ImageIcon,",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 245,
        code: "icon: ImageIcon,",
        area: "app"
      },
      {
        file: "explorations/previews/frame.tsx",
        line: 26,
        code: '{ value: "images", label: "Images", icon: ImageIcon },',
        area: "exploration"
      },
      {
        file: "media/MediaCard.tsx",
        line: 13,
        code: "export const mediumIcons: Record<ImageMedium, LucideIcon> = { image: ImageIcon, vector: PenTool, video: Film }",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Image",
      file: "image",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ImageMultiple",
        file: "image-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ImageEdit",
        file: "image-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ImageCircle",
        file: "image-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ImageSparkle",
        file: "image-sparkle",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ImageDown",
    lucideKey: "ImageDown",
    context: "Export selection as image",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 125,
        code: "exportSelection: ImageDown,",
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 69,
        code: 'export: { icon: ImageDown, tint: "oklch(0.74 0.12 205)", role: "Exports images" },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SaveImage",
      file: "save-image",
      sizes: [20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ImageArrowForward",
        file: "image-arrow-forward",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowDownload",
        file: "arrow-download",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ImageCopy",
        file: "image-copy",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Image",
        file: "image",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "ImageOff",
    lucideKey: "ImageOff",
    context: "Clear bitmap cache",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 368,
        code: "<ImageOff /> Clear bitmap cache",
        area: "app"
      },
      {
        file: "media/ProjectPicture.tsx",
        line: 91,
        code: '<ImageOff aria-hidden className="size-4 text-(--process-starting)" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ImageOff",
      file: "image-off",
      sizes: [20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ImageProhibited",
        file: "image-prohibited",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ImageDismiss",
        file: "image-dismiss",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "ImageMultipleOff",
        file: "image-multiple-off",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "Delete",
        file: "delete",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ImagePlay",
    lucideKey: "ImagePlay",
    context: "Media tab",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/LeftPanel.tsx",
        line: 27,
        code: '{ value: "media", label: "Media", icon: ImagePlay },',
        area: "app"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 110,
        code: '{ value: "media", label: "Media", icon: ImagePlay },',
        area: "exploration"
      },
      {
        file: "explorations/screen-container/workspace.tsx",
        line: 40,
        code: '{ value: "media", label: "Media", icon: ImagePlay },',
        area: "exploration"
      },
      {
        file: "media/MediaPanel.tsx",
        line: 261,
        code: '<ImagePlay className="size-6" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ImageMultiple",
      file: "image-multiple",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FilmstripImage",
        file: "filmstrip-image",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "VideoClip",
        file: "video-clip",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PlayCircle",
        file: "play-circle",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "ImageStack",
        file: "image-stack",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ImagePlus",
    lucideKey: "ImagePlus",
    context: "Add image",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/image-fill.tsx",
        line: 136,
        code: '<ImagePlus className="size-5" style={{ color: kindColors.layer }} />',
        area: "app"
      },
      {
        file: "inspector/controls/image-fill.tsx",
        line: 257,
        code: '<ImagePlus className="size-4" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ImageAdd",
      file: "image-add",
      sizes: [20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Image",
        file: "image",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "AddSquare",
        file: "add-square",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CameraAdd",
        file: "camera-add",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "ImageMultiple",
        file: "image-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Inbox",
    lucideKey: "Inbox",
    context: "Inbox, empty state",
    areas: ["app", "exploration"],
    files: 6,
    sites: [
      {
        file: "chrome/ExtensionView.tsx",
        line: 136,
        code: "<Inbox />",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 147,
        code: "icon: Inbox,",
        area: "app"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 146,
        code: 'icon={<Inbox className="size-4" />}',
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 147,
        code: 'label="Inbox"',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 866,
        code: '{ label: "Inbox", icon: Inbox },',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 18,
        code: "Inbox as InboxIcon,",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 1067,
        code: '<InboxIcon className="size-5" />',
        area: "exploration"
      },
      {
        file: "start/HomePage.tsx",
        line: 310,
        code: '<Inbox className="size-4" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "MailInbox",
      file: "mail-inbox",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "MailInboxAll",
        file: "mail-inbox-all",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Archive",
        file: "archive",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TrayItemAdd",
        file: "tray-item-add",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Mail",
        file: "mail",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Info",
    lucideKey: "Info",
    context: "Minor issue, notes",
    areas: ["app", "story", "exploration"],
    files: 9,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 48,
        code: 'minor: { label: "minor", icon: Info, tone: "text-muted-foreground" }',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 246,
        code: '<Info className="mt-0.5 size-3.5 shrink-0" />',
        area: "app"
      },
      {
        file: "chrome/AppMenu.tsx",
        line: 380,
        code: "<Info /> About Parity",
        area: "app"
      },
      {
        file: "chrome/BaseDesignNote.tsx",
        line: 31,
        code: '<Info className="mt-0.5 size-3.5 shrink-0" style={{ color: kindColors.component }} aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 189,
        code: 'const levelNames: Record<Shown, string> = { error: "Errors", warning: "Warnings", info: "Info" }',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 216,
        code: 'info: <Info className="text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 334,
        code: 'info: { icon: <Info className="size-3.5 text-muted-foreground" />, row: "", text: "", label: "Info" },',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 336,
        code: 'icon: <Info className="size-3.5 text-muted-foreground/60" />,',
        area: "app"
      }
    ],
    moreSites: 5,
    fluent: {
      name: "Info",
      file: "info",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "InfoSparkle",
        file: "info-sparkle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "QuestionCircle",
        file: "question-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Lightbulb",
        file: "lightbulb",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ErrorCircle",
        file: "error-circle",
        sizes: [12, 16, 20, 24, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Italic",
    lucideKey: "Italic",
    context: "Italic style",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/font-fields.tsx",
        line: 377,
        code: "* Weight and style: a ValueField, as every token field is, with Italic beside it. A weight token is its chip",
        area: "app"
      },
      {
        file: "inspector/controls/font-fields.tsx",
        line: 601,
        code: '<Hint label="Italic" detail={italicFaked ? `Faked by the browser: ${font.name} has no italic` : undefined}>',
        area: "app"
      },
      {
        file: "inspector/controls/font-fields.tsx",
        line: 606,
        code: 'aria-label="Italic"',
        area: "app"
      },
      {
        file: "inspector/controls/font-fields.tsx",
        line: 610,
        code: "<Italic />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextItalic",
      file: "text-italic",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextFont",
        file: "text-font",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextT",
        file: "text-t",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextBold",
        file: "text-bold",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "TextUnderline",
        file: "text-underline",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Keyboard",
    lucideKey: "Keyboard",
    context: "Keyboard shortcuts, a11y",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 279,
        code: '<Keyboard className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 130,
        code: "shortcuts: Keyboard,",
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 104,
        code: '{ id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, group: 0 },',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 249,
        code: 'title: "Keyboard",',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 252,
        code: "icon: Keyboard,",
        area: "app"
      },
      {
        file: "explorations/start/page.tsx",
        line: 460,
        code: '<Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>{formatKeys("Ctrl /")}</DropdownMenuShortcut>',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Keyboard",
      file: "keyboard",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "KeyboardShift",
        file: "keyboard-shift",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "KeyCommand",
        file: "key-command",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Keyboard123",
        file: "keyboard",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DesktopKeyboard",
        file: "desktop-keyboard",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "KeyRound",
    lucideKey: "KeyRound",
    context: "Single sign-on, access requests",
    areas: ["app", "exploration"],
    files: 8,
    sites: [
      {
        file: "account/AccountMenu.tsx",
        line: 117,
        code: '<KeyRound className="size-3.5" />',
        area: "app"
      },
      {
        file: "account/SignInPanels.tsx",
        line: 337,
        code: '"single-sign-on": { icon: <KeyRound />, color: "oklch(0.55 0.18 275)" }',
        area: "app"
      },
      {
        file: "account/SignInPanels.tsx",
        line: 410,
        code: "<KeyRound /> Continue with single sign-on",
        area: "app"
      },
      {
        file: "account/SignInPanels.tsx",
        line: 548,
        code: "{providers.find((candidate) => candidate.provider === provider)?.mark ?? <KeyRound />}",
        area: "app"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 142,
        code: 'access: { verb: "asked for access", icon: KeyRound, color: "oklch(0.78 0.14 75)" },',
        area: "exploration"
      },
      {
        file: "explorations/lenses/canvas.tsx",
        line: 724,
        code: '{column.key === "primary" && <KeyRound className="size-3.5 text-amber-500" />}',
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 153,
        code: '<KeyRound className="size-3.5 text-amber-500" aria-label="Primary key" />',
        area: "exploration"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 200,
        code: "return KeyRound",
        area: "exploration"
      }
    ],
    moreSites: 2,
    fluent: {
      name: "Key",
      file: "key",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "KeyMultiple",
        file: "key-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Password",
        file: "password",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LockClosedKey",
        file: "lock-closed-key",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PersonKey",
        file: "person-key",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Languages",
    lucideKey: "Languages",
    context: "Locale mode",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/ModesPanel.tsx",
        line: 45,
        code: "const kindIcons = { viewport: Monitor, theme: Palette, locale: Languages, custom: SlidersHorizontal }",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 154,
        code: "icon: Languages,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LocalLanguage",
      file: "local-language",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Translate",
        file: "translate",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TranslateAuto",
        file: "translate-auto",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Globe",
        file: "globe",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "LocalLanguageGlobe",
        file: "local-language-globe",
        sizes: [20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Laptop",
    lucideKey: "Laptop",
    context: "Laptop viewport",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/viewports.tsx",
        line: 27,
        code: "const deviceIcons = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor }",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Laptop",
      file: "laptop",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Desktop",
        file: "desktop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PhoneLaptop",
        file: "phone-laptop",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "TabletLaptop",
        file: "tablet-laptop",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Window",
        file: "window",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayerArrowDown",
    lucideKey: "LayerArrowDown",
    context: "Send backward",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 100,
        code: "sendBackward: LayerArrowDown,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PositionBackward",
      file: "position-backward",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowDown",
        file: "arrow-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSortDown",
        file: "arrow-sort-down",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayerDiagonal",
        file: "layer-diagonal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDown",
        file: "chevron-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayerArrowUp",
    lucideKey: "LayerArrowUp",
    context: "Bring forward",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 99,
        code: "bringForward: LayerArrowUp,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PositionForward",
      file: "position-forward",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowUp",
        file: "arrow-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSortUp",
        file: "arrow-sort-up",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayerDiagonal",
        file: "layer-diagonal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronUp",
        file: "chevron-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Layers",
    lucideKey: "Layers",
    context: "Layers panel",
    areas: ["app", "exploration"],
    files: 14,
    sites: [
      {
        file: "chrome/CanvasMenu.tsx",
        line: 221,
        code: "// in Layers.",
        area: "app"
      },
      {
        file: "chrome/CanvasMenu.tsx",
        line: 291,
        code: "<Layers /> {label}",
        area: "app"
      },
      {
        file: "chrome/CanvasMenu.tsx",
        line: 380,
        code: "// A locked design gets the empty canvas's menu, unless it's selected, from Layers (PAR-192).",
        area: "app"
      },
      {
        file: "chrome/LeftPanel.tsx",
        line: 21,
        code: 'label="Layers, assets and tokens"',
        area: "app"
      },
      {
        file: "chrome/LeftPanel.tsx",
        line: 24,
        code: '{ value: "layers", label: "Layers", icon: Layers },',
        area: "app"
      },
      {
        file: "chrome/LeftPanel.tsx",
        line: 33,
        code: '<ErrorBoundary name="left.layers" label="Layers">',
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 89,
        code: '<Layers className="size-4 shrink-0" style={{ color: designColor("screen") }} />',
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 122,
        code: "* Values they share show as usual; the ones that differ are listed, and setting one gives them all that value. Layers",
        area: "app"
      }
    ],
    moreSites: 29,
    fluent: {
      name: "LayerDiagonal",
      file: "layer-diagonal",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Layer",
        file: "layer",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Stack",
        file: "stack",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SquareMultiple",
        file: "square-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextBulletListTree",
        file: "text-bullet-list-tree",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayersArrowDown",
    lucideKey: "LayersArrowDown",
    context: "Send to back",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 102,
        code: "sendToBack: LayersArrowDown,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PositionToBack",
      file: "position-to-back",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChevronDoubleDown",
        file: "chevron-double-down",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSortDownLines",
        file: "arrow-sort-down-lines",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayerDiagonal",
        file: "layer-diagonal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowDown",
        file: "arrow-down",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayersArrowUp",
    lucideKey: "LayersArrowUp",
    context: "Bring to front",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 101,
        code: "bringToFront: LayersArrowUp,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PositionToFront",
      file: "position-to-front",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChevronDoubleUp",
        file: "chevron-double-up",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSortUpLines",
        file: "arrow-sort-up-lines",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayerDiagonal",
        file: "layer-diagonal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowUp",
        file: "arrow-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayoutDashboard",
    lucideKey: "LayoutDashboard",
    context: "Overview nav in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-web.tsx",
        line: 356,
        code: '{ label: "Overview", icon: LayoutDashboard },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Board",
      file: "board",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "BoardSplit",
        file: "board-split",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "Grid",
        file: "grid",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DataPie",
        file: "data-pie",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "LayoutCellFour",
        file: "layout-cell-four",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayoutGrid",
    lucideKey: "LayoutGrid",
    context: "Grid view",
    areas: ["app", "exploration"],
    files: 8,
    sites: [
      {
        file: "chrome/AssetsPanel.tsx",
        line: 381,
        code: '{ view: "grid", label: "Grid", Icon: LayoutGrid }',
        area: "app"
      },
      {
        file: "chrome/TokensPanel.tsx",
        line: 343,
        code: '<LayoutGrid className="size-3.5" />',
        area: "app"
      },
      {
        file: "explorations/portal/projects.tsx",
        line: 64,
        code: '<LayoutGrid className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/recents.tsx",
        line: 19,
        code: '<LayoutGrid className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 363,
        code: '<LayoutGrid className="size-3.5" />',
        area: "exploration"
      },
      {
        file: "explorations/start/new-project.tsx",
        line: 701,
        code: 'icon: <LayoutGrid className="size-4" />,',
        area: "exploration"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 73,
        code: '{ value: "grid", label: "Grid", detail: "Children fill the cells of columns and rows", icon: <LayoutGrid /> }',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1492,
        code: '<LayoutGrid className="size-3" />',
        area: "app"
      }
    ],
    moreSites: 1,
    fluent: {
      name: "Grid",
      file: "grid",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ContentViewGallery",
        file: "content-view-gallery",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "GridKanban",
        file: "grid-kanban",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "LayoutCellFour",
        file: "layout-cell-four",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayoutPanelTop",
    lucideKey: "LayoutPanelTop",
    context: "Sharing: page target",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 382,
        code: "icon: LayoutPanelTop,",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LayoutRowTwoSplitBottom",
      file: "layout-row-two-split-bottom",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LayoutRowTwo",
        file: "layout-row-two",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Board",
        file: "board",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "WindowHeaderHorizontal",
        file: "window-header-horizontal",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "LayoutCellFour",
        file: "layout-cell-four",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LayoutTemplate",
    lucideKey: "LayoutTemplate",
    context: "Page, route and layout kind",
    areas: ["app", "exploration"],
    files: 6,
    sites: [
      {
        file: "canvas/PageLinksUtil.tsx",
        line: 285,
        code: '<LayoutTemplate className="size-4 shrink-0" style={{ color }} />',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1319,
        code: '{layout && <LayoutTemplate className="size-3.5 shrink-0" style={iconStyle} />}',
        area: "app"
      },
      {
        file: "chrome/RoutePanel.tsx",
        line: 90,
        code: "icon={<LayoutTemplate className={headingIcon} />}",
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 1749,
        code: '<LayoutTemplate className="size-3.5" style={{ color }} aria-hidden />',
        area: "exploration"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 193,
        code: 'layout: { icon: LayoutTemplate, color: kindColors.screen, word: "Layout" },',
        area: "exploration"
      },
      {
        file: "inspector/controls/controls.tsx",
        line: 1281,
        code: "<LayoutTemplate />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LayoutColumnTwoSplitRight",
      file: "layout-column-two-split-right",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Board",
        file: "board",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "DocumentOnePage",
        file: "document-one-page",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "WebAsset",
        file: "web-asset",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayoutRowTwoSplitBottom",
        file: "layout-row-two-split-bottom",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Leaf",
    lucideKey: "Leaf",
    context: "Emoji category: nature",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 36,
        code: '["nature", Leaf],',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LeafOne",
      file: "leaf-one",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LeafTwo",
        file: "leaf-two",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LeafThree",
        file: "leaf-three",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TreeDeciduous",
        file: "tree-deciduous",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "EarthLeaf",
        file: "earth-leaf",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Library",
    lucideKey: "Library",
    context: "Libraries",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/AssetsPanel.tsx",
        line: 322,
        code: 'icon: <Library className="size-3.5 text-muted-foreground" />,',
        area: "app"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 164,
        code: '<NavItem icon={<Library className="size-4" />} label="Libraries" active={active === "libraries"} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Library",
      file: "library",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "BookDatabase",
        file: "book-database",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "Book",
        file: "book",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BookOpen",
        file: "book-open",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BookStar",
        file: "book-star",
        sizes: [20, 24],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "LibraryBig",
    lucideKey: "LibraryBig",
    context: "Library in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-web.tsx",
        line: 1069,
        code: "{[Users, LibraryBig, Settings].map((Icon, index) => (",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Library",
      file: "library",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "BookDatabase",
        file: "book-database",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "Book",
        file: "book",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "BookOpen",
        file: "book-open",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Bookmark",
        file: "bookmark",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "LifeBuoy",
    lucideKey: "LifeBuoy",
    context: "Support (impersonation)",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/Impersonation.stories.tsx",
        line: 57,
        code: '<LifeBuoy className="size-4 shrink-0" aria-hidden />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PersonSupport",
      file: "person-support",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChatHelp",
        file: "chat-help",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Headset",
        file: "headset",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "QuestionCircle",
        file: "question-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ChatBubblesQuestion",
        file: "chat-bubbles-question",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Lightbulb",
    lucideKey: "Lightbulb",
    context: "Emoji category: objects, tips",
    areas: ["exploration", "app"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 38,
        code: '["objects", Lightbulb],',
        area: "exploration"
      },
      {
        file: "library/BrowserStates.tsx",
        line: 129,
        code: "<Lightbulb /> Tips",
        area: "app"
      },
      {
        file: "library/BrowserStates.tsx",
        line: 138,
        code: '<Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Lightbulb",
      file: "lightbulb",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "LightbulbFilament",
        file: "lightbulb-filament",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "LightbulbSparkle",
        file: "lightbulb-sparkle",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Sparkle",
        file: "sparkle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Info",
        file: "info",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Link",
    lucideKey: "Link",
    context: "Link element kind, copy link",
    areas: ["app", "exploration"],
    files: 6,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 39,
        code: "link: Link,",
        area: "app"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 305,
        code: "<Link /> Copy link",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 888,
        code: "<Link /> Copy link",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 911,
        code: "<Link2 /> Link an existing issue",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 354,
        code: "{copied ? <Check /> : <Link />}",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 355,
        code: '{copied ? "Link copied" : "Copy link"}',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 434,
        code: "<span>Link copied</span>",
        area: "exploration"
      },
      {
        file: "explorations/portal/share.tsx",
        line: 160,
        code: "<Link /> Copy link",
        area: "exploration"
      }
    ],
    moreSites: 2,
    fluent: {
      name: "Link",
      file: "link",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "LinkSquare",
        file: "link-square",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LinkMultiple",
        file: "link-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "LinkEdit",
        file: "link-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Share",
        file: "share",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Link2",
    lucideKey: "Link2",
    context: "Linked prop or token, link an issue",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "chrome/text-prop.tsx",
        line: 65,
        code: '<Link2 className="size-3.5 shrink-0" style={{ color: propColor }} />',
        area: "app"
      },
      {
        file: "chrome/text-prop.tsx",
        line: 99,
        code: "<Link2 />",
        area: "app"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 911,
        code: "<Link2 /> Link an existing issue",
        area: "exploration"
      },
      {
        file: "explorations/lenses/canvas.tsx",
        line: 725,
        code: '{column.key === "foreign" && <Link2 className="size-3.5" style={{ color: look.color }} />}',
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 156,
        code: "<Link2",
        area: "exploration"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 203,
        code: 'return key === "foreign" ? Link2 : Type',
        area: "exploration"
      },
      {
        file: "explorations/portal/changes.tsx",
        line: 619,
        code: "<Link2 /> Copy link to this comparison",
        area: "exploration"
      },
      {
        file: "inspector/controls/controls.tsx",
        line: 168,
        code: "<Link2 />",
        area: "app"
      }
    ],
    moreSites: 2,
    fluent: {
      name: "Link",
      file: "link",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "LinkMultiple",
        file: "link-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "LinkAdd",
        file: "link-add",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LinkSquare",
        file: "link-square",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LinkEdit",
        file: "link-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "List",
    lucideKey: "List",
    context: "List view, list kind",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 57,
        code: "list: List,",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 124,
        code: "applyDocuments(doc, `List ${name} as a component`, [{ path: doc.main, document: { ...rest, detection } }], {",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 378,
        code: "const views: { view: ComponentsView; label: string; Icon: typeof List }[] = [",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 380,
        code: '{ view: "list", label: "List", Icon: List },',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 542,
        code: '<Hint label="List it as a component, in the project file" wait>',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 549,
        code: "List it",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 718,
        code: "/** The sizes of a component's picture in the List and Grid views, in CSS pixels. */",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 723,
        code: "* pressed on it (PAR-515, PAR-208), or a library's component design, with a hint. In the List and Grid views a",
        area: "app"
      }
    ],
    moreSites: 9,
    fluent: {
      name: "List",
      file: "list",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextBulletListLtr",
        file: "text-bullet-list-ltr",
        sizes: [16, 20, 24, 90],
        unsized: true,
        color: false
      },
      {
        name: "ListBar",
        file: "list-bar",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "AppsList",
        file: "apps-list",
        sizes: [20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "TextBulletList",
        file: "text-bullet-list",
        sizes: [16, 20, 24, 90],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ListFilter",
    lucideKey: "ListFilter",
    context: "Filter",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/pins.tsx",
        line: 258,
        code: "<ListFilter /> Everyone",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 1082,
        code: '<ListFilter className="ml-auto size-4 text-(--r-muted)" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Filter",
      file: "filter",
      sizes: [12, 16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FilterAdd",
        file: "filter-add",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Options",
        file: "options",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "TextSortAscending",
        file: "text-sort-ascending",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSort",
        file: "arrow-sort",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ListOrdered",
    lucideKey: "ListOrdered",
    context: "Ordered list",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 216,
        code: "icon: ListOrdered,",
        area: "app"
      },
      {
        file: "inspector/controls/filter-list.tsx",
        line: 668,
        code: '<ListOrdered className="size-3.5" /> Put in order',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextNumberListLtr",
      file: "text-number-list-ltr",
      sizes: [16, 20, 24, 28, 90],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextBulletListLtr",
        file: "text-bullet-list-ltr",
        sizes: [16, 20, 24, 90],
        unsized: true,
        color: false
      },
      {
        name: "NumberRow",
        file: "number-row",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "List",
        file: "list",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "TextNumberFormat",
        file: "text-number-format",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ListX",
    lucideKey: "ListX",
    context: "Clear recent projects",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 196,
        code: "<ListX /> Clear recent projects",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Broom",
      file: "broom",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextBulletListDismiss",
        file: "text-bullet-list-dismiss",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "HistoryDismiss",
        file: "history-dismiss",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Delete",
        file: "delete",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DismissCircle",
        file: "dismiss-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Loader",
    lucideKey: "Loader",
    context: "Loader element kind",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 50,
        code: "loader: Loader,",
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 157,
        code: '["wait", Loader],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SpinnerIos",
      file: "spinner-ios",
      sizes: [16, 20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowSync",
        file: "arrow-sync",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "ArrowClockwiseDashes",
        file: "arrow-clockwise-dashes",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Hourglass",
        file: "hourglass",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleHint",
        file: "circle-hint",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Loader2",
    lucideKey: "LoaderCircle",
    context: "Loading toast",
    areas: ["story"],
    files: 1,
    sites: [
      {
        file: "chrome/ToastAudit.stories.tsx",
        line: 1211,
        code: 'loading: <Loader2Icon className="animate-spin" aria-hidden="true" />,',
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SpinnerIos",
      file: "spinner-ios",
      sizes: [16, 20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowSync",
        file: "arrow-sync",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "ArrowClockwiseDashes",
        file: "arrow-clockwise-dashes",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Hourglass",
        file: "hourglass",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleHint",
        file: "circle-hint",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LoaderCircle",
    lucideKey: "LoaderCircle",
    context: "Loading spinners",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 214,
        code: '<LoaderCircle className="size-3.5 shrink-0 animate-spin" />',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 220,
        code: '<LoaderCircle className="size-5 animate-spin" />',
        area: "app"
      },
      {
        file: "chrome/AddLibraryDialog/AddLibraryDialog.tsx",
        line: 69,
        code: '<LoaderCircle aria-label="Loading" className="m-auto size-5 animate-spin text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/AddLibraryDialog/LibraryDetail.tsx",
        line: 76,
        code: '<LoaderCircle aria-label="Loading" className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1269,
        code: '{!catalog && <LoaderCircle className="mx-auto my-3 size-4 animate-spin text-muted-foreground" />}',
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 272,
        code: '<LoaderCircle className="size-3 animate-spin" />',
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 285,
        code: '{making && <LoaderCircle className="size-3.5 animate-spin" />}',
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 158,
        code: '["progress", LoaderCircle],',
        area: "app"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "SpinnerIos",
      file: "spinner-ios",
      sizes: [16, 20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowSync",
        file: "arrow-sync",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "ArrowClockwiseDashes",
        file: "arrow-clockwise-dashes",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ArrowClockwise",
        file: "arrow-clockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CircleHint",
        file: "circle-hint",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LocateFixed",
    lucideKey: "LocateFixed",
    context: "Go to person",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "packages/presence-ui/src/PersonCard.tsx",
        line: 48,
        code: "<LocateFixed /> Go to",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "MyLocation",
      file: "my-location",
      sizes: [12, 16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LocationTargetSquare",
        file: "location-target-square",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Target",
        file: "target",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Location",
        file: "location",
        sizes: [12, 16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "NavigationLocationTarget",
        file: "navigation-location-target",
        sizes: [20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Lock",
    lucideKey: "Lock",
    context: "Locked layer, private",
    areas: ["app", "exploration"],
    files: 13,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 544,
        code: '<Lock className="size-4 text-muted-foreground" aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 104,
        code: "lock: Lock,",
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1651,
        code: '<Lock className="size-3" aria-label="Locked" />',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1661,
        code: 'const label = lock ? "Unlock layer" : "Lock layer"',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1666,
        code: 'const label = `${lock ? "Unlock" : "Lock"} ${kindName(container.kind)}`',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1746,
        code: 'const label = locked ? "Unlock" : "Lock"',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1761,
        code: '{locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}',
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 688,
        code: '<Lock className="mr-1 size-2.5 shrink-0" style={{ color: "var(--process-running)" }} strokeWidth={2.5} />',
        area: "app"
      }
    ],
    moreSites: 13,
    fluent: {
      name: "LockClosed",
      file: "lock-closed",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "LockShield",
        file: "lock-shield",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ShieldLock",
        file: "shield-lock",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "Key",
        file: "key",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "LockClosedKey",
        file: "lock-closed-key",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LockOpen",
    lucideKey: "LockOpen",
    context: "Unlocked layer",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/LayerTree.tsx",
        line: 1761,
        code: '{locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}',
        area: "app"
      },
      {
        file: "inspector/controls/field-row.tsx",
        line: 256,
        code: '{lock.open ? <LockOpen className="size-3" /> : <Lock className="size-3" />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LockOpen",
      file: "lock-open",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LockClosed",
        file: "lock-closed",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Key",
        file: "key",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "WarningLockOpen",
        file: "warning-lock-open",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShieldDismiss",
        file: "shield-dismiss",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LogIn",
    lucideKey: "LogIn",
    context: "Sign in",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/page.tsx",
        line: 427,
        code: "<LogIn /> Sign in",
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 1284,
        code: "<LogIn /> Sign in to see your organizations",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowEnter",
      file: "arrow-enter",
      sizes: [16, 20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DoorArrowRight",
        file: "door-arrow-right",
        sizes: [16, 20, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "PersonArrowRight",
        file: "person-arrow-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Key",
        file: "key",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "PersonCircle",
        file: "person-circle",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "LogOut",
    lucideKey: "LogOut",
    context: "Exit, sign out",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 217,
        code: '<LogOut /> Exit <MenubarShortcut>{shortcutOf("exit")}</MenubarShortcut>',
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 299,
        code: '<LogOut /> Exit <MenubarShortcut>{shortcutOf("exit")}</MenubarShortcut>',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 472,
        code: "<LogOut /> Sign out",
        area: "exploration"
      },
      {
        file: "packages/presence-ui/src/FollowLayer.tsx",
        line: 55,
        code: '{state === "left" && <FollowEnded icon={LogOut} title={`${shortName(leader)} left, so following stopped`} />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowExit",
      file: "arrow-exit",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DoorArrowLeft",
        file: "door-arrow-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SignOut",
        file: "sign-out",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PersonArrowLeft",
        file: "person-arrow-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Power",
        file: "power",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Magnet",
    lucideKey: "Magnet",
    context: "Snapping toggle (Fluent has no magnet)",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 291,
        code: "icon={Magnet}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "GridDots",
      file: "grid-dots",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Pin",
        file: "pin",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Target",
        file: "target",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "AlignStraighten",
        file: "align-straighten",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowFit",
        file: "arrow-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Mail",
    lucideKey: "Mail",
    context: "Email, mark unread",
    areas: ["exploration"],
    files: 4,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 308,
        code: "<Mail /> Mark unread from here",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 885,
        code: "<Mail /> Mark as unread",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/sharing.tsx",
        line: 240,
        code: '<Mail className="size-3.5" />',
        area: "exploration"
      },
      {
        file: "explorations/home/account.tsx",
        line: 955,
        code: '<Mail className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/share.tsx",
        line: 130,
        code: '<Mail className="size-3.5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Mail",
      file: "mail",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "MailUnread",
        file: "mail-unread",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "MailRead",
        file: "mail-read",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Send",
        file: "send",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "MailInbox",
        file: "mail-inbox",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Maximize",
    lucideKey: "Maximize",
    context: "Zoom to fit, fullscreen",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 118,
        code: "zoomToFit: Maximize,",
        area: "app"
      },
      {
        file: "chrome/ZoomControls.tsx",
        line: 70,
        code: "<Maximize />",
        area: "app"
      },
      {
        file: "explorations/lenses/canvas.tsx",
        line: 921,
        code: "<Maximize />",
        area: "exploration"
      },
      {
        file: "inspector/controls/pin-box.tsx",
        line: 390,
        code: "<Maximize />",
        area: "app"
      },
      {
        file: "packages/media-player/src/VideoPlayer.tsx",
        line: 189,
        code: "{fullscreen ? <Minimize /> : <Maximize />}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ZoomFit",
      file: "zoom-fit",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FullScreenMaximize",
        file: "full-screen-maximize",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ScaleFit",
        file: "scale-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMaximize",
        file: "arrow-maximize",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PageFit",
        file: "page-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Maximize2",
    lucideKey: "Maximize2",
    context: "Expand result",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "library/ResultsGrid.tsx",
        line: 247,
        code: "<Maximize2 />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowMaximize",
      file: "arrow-maximize",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FullScreenMaximize",
        file: "full-screen-maximize",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowExpand",
        file: "arrow-expand",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Open",
        file: "open",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMaximizeTopLeftBottomRight",
        file: "arrow-maximize-top-left-bottom-right",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Megaphone",
    lucideKey: "Megaphone",
    context: "Announcement annotation",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 259,
        code: "icon: Megaphone,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Megaphone",
      file: "megaphone",
      sizes: [12, 16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "MegaphoneLoud",
        file: "megaphone-loud",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "MegaphoneCircle",
        file: "megaphone-circle",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Speaker2",
        file: "speaker",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Alert",
        file: "alert",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Menu",
    lucideKey: "Menu",
    context: "Menu in sample app",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/portal/pricing-render.tsx",
        line: 174,
        code: '<Menu className="size-6" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 200,
        code: '<Menu className="size-6" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 336,
        code: '<Menu className="size-6" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LineHorizontal3",
      file: "line-horizontal",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Navigation",
        file: "navigation",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextAlignJustify",
        file: "text-align-justify",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "MoreVertical",
        file: "more-vertical",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "MessageCircle",
    lucideKey: "MessageCircle",
    context: "Comment annotation",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "collaboration/annotations/annotation-kinds.ts",
        line: 42,
        code: "icon: MessageCircle,",
        area: "app"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 1088,
        code: '<MessageCircle className="size-3.5" /> {card.comments}',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Chat",
      file: "chat",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ChatEmpty",
        file: "chat-empty",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Comment",
        file: "comment",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ChatMultiple",
        file: "chat-multiple",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ChatBubblesQuestion",
        file: "chat-bubbles-question",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "MessageSquare",
    lucideKey: "MessageSquare",
    context: "Comments",
    areas: ["exploration"],
    files: 6,
    sites: [
      {
        file: "explorations/collaboration/notes.tsx",
        line: 230,
        code: '<MessageSquare className="size-3.5" /> {comments}',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 138,
        code: 'reply: { verb: "replied", icon: MessageSquare, color: commentBlue },',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 220,
        code: '{ id: "all", title: "All", icon: MessageSquare, matches: () => true },',
        area: "exploration"
      },
      {
        file: "explorations/portal/changes.tsx",
        line: 956,
        code: "<MessageSquare />",
        area: "exploration"
      },
      {
        file: "explorations/portal/changes.tsx",
        line: 1054,
        code: '<MessageSquare className="size-3.5 shrink-0" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 18,
        code: "comment: MessageSquare,",
        area: "exploration"
      },
      {
        file: "explorations/portal/search.tsx",
        line: 134,
        code: '<MessageSquare className="size-3" /> {hit.who.name} on {hit.where}, {hit.when.toLowerCase()}',
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 158,
        code: "comment: MessageSquare,",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Comment",
      file: "comment",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CommentMultiple",
        file: "comment-multiple",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "CommentText",
        file: "comment-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Chat",
        file: "chat",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ChatEmpty",
        file: "chat-empty",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MessageSquarePlus",
    lucideKey: "MessageSquarePlus",
    context: "Add comment",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/live-board.tsx",
        line: 321,
        code: '<MessageSquarePlus style={{ color: commentBlue }} /> Comment <Kbd className="ml-0.5">{formatKeys("C")}</Kbd>',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/pins.tsx",
        line: 250,
        code: '<MessageSquarePlus className="size-4" style={{ color: commentBlue }} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CommentAdd",
      file: "comment-add",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ChatAdd",
        file: "chat-add",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "CommentEdit",
        file: "comment-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AddSquare",
        file: "add-square",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Comment",
        file: "comment",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "MessageSquareWarning",
    lucideKey: "MessageSquareWarning",
    context: "Report a problem",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 352,
        code: "<MessageSquareWarning /> Report a problem…",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 390,
        code: "<MessageSquareWarning /> Report a problem…",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CommentError",
      file: "comment-error",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PersonFeedback",
        file: "person-feedback",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ChatWarning",
        file: "chat-warning",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Bug",
        file: "bug",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ErrorCircle",
        file: "error-circle",
        sizes: [12, 16, 20, 24, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "MessagesSquare",
    lucideKey: "MessagesSquare",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 204,
        code: 'look: { hue: 312, brand: "Relay", icon: MessagesSquare, dark: true, org: "Kestrel" },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ChatMultiple",
      file: "chat-multiple",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "CommentMultiple",
        file: "comment-multiple",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Chat",
        file: "chat",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "PeopleChat",
        file: "people-chat",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ChatBubblesQuestion",
        file: "chat-bubbles-question",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Minimize",
    lucideKey: "Minimize",
    context: "Exit fullscreen",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "packages/media-player/src/VideoPlayer.tsx",
        line: 189,
        code: "{fullscreen ? <Minimize /> : <Maximize />}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "FullScreenMinimize",
      file: "full-screen-minimize",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowMinimize",
        file: "arrow-minimize",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMinimizeTopLeftBottomRight",
        file: "arrow-minimize-top-left-bottom-right",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ZoomFit",
        file: "zoom-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCollapseAll",
        file: "arrow-collapse-all",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Minus",
    lucideKey: "Minus",
    context: "Zoom out, remove, window minimize",
    areas: ["app", "exploration"],
    files: 11,
    sites: [
      {
        file: "chrome/ExportSection.tsx",
        line: 73,
        code: "<Minus />",
        area: "app"
      },
      {
        file: "chrome/ZoomControls.tsx",
        line: 51,
        code: "<Minus />",
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 581,
        code: '<Minus className="size-4" />',
        area: "exploration"
      },
      {
        file: "explorations/lenses/canvas.tsx",
        line: 903,
        code: "<Minus />",
        area: "exploration"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 100,
        code: "{[Minus, Square, X].map((Icon, index) => (",
        area: "exploration"
      },
      {
        file: "explorations/parts.tsx",
        line: 139,
        code: "{[Minus, Square, X].map((Glyph, index) => (",
        area: "exploration"
      },
      {
        file: "explorations/portal/admin.tsx",
        line: 351,
        code: 'cell = <Minus className="size-4 opacity-40" aria-label="No" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/admin.tsx",
        line: 550,
        code: '<Minus className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 4,
    fluent: {
      name: "Subtract",
      file: "subtract",
      sizes: [12, 16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SubtractCircle",
        file: "subtract-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LineHorizontal1",
        file: "line-horizontal",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ZoomOut",
        file: "zoom-out",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "SubtractSquare",
        file: "subtract-square",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Monitor",
    lucideKey: "Monitor",
    context: "Desktop viewport, system theme",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "chrome/ModesPanel.tsx",
        line: 45,
        code: "const kindIcons = { viewport: Monitor, theme: Palette, locale: Languages, custom: SlidersHorizontal }",
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 124,
        code: '{ value: "system", label: "System", icon: Monitor }',
        area: "app"
      },
      {
        file: "chrome/viewports.tsx",
        line: 27,
        code: "const deviceIcons = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor }",
        area: "app"
      },
      {
        file: "explorations/portal/changes.tsx",
        line: 625,
        code: "<Monitor /> Open in the desktop app",
        area: "exploration"
      },
      {
        file: "explorations/portal/inbox.tsx",
        line: 91,
        code: "<Monitor /> Open in the desktop app",
        area: "exploration"
      },
      {
        file: "explorations/portal/inspect.tsx",
        line: 133,
        code: "<Monitor /> Open in the desktop app",
        area: "exploration"
      },
      {
        file: "inspector/controls/controls.tsx",
        line: 1444,
        code: '<Monitor aria-hidden className="size-3.5" />',
        area: "app"
      },
      {
        file: "library/FilterControls.tsx",
        line: 29,
        code: "return <Monitor />",
        area: "app"
      }
    ],
    moreSites: 1,
    fluent: {
      name: "Desktop",
      file: "desktop",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DesktopMac",
        file: "desktop-mac",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Laptop",
        file: "laptop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Window",
        file: "window",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TabletLaptop",
        file: "tablet-laptop",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MonitorPlay",
    lucideKey: "MonitorPlay",
    context: "Presenting",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "packages/presence-ui/src/PresentingBar.tsx",
        line: 32,
        code: '<MonitorPlay className="size-3" strokeWidth={2.5} />',
        area: "app"
      },
      {
        file: "packages/presence-ui/src/YouCard.tsx",
        line: 29,
        code: "<MonitorPlay /> Present to everyone",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ShareScreenStart",
      file: "share-screen-start",
      sizes: [16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Presenter",
        file: "presenter",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ProjectionScreen",
        file: "projection-screen",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DesktopPulse",
        file: "desktop-pulse",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Live",
        file: "live",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MonitorSmartphone",
    lucideKey: "MonitorSmartphone",
    context: "Viewports, Modes tab, screen kind",
    areas: ["app", "exploration"],
    files: 10,
    sites: [
      {
        file: "canvas/BoardMenus.tsx",
        line: 51,
        code: 'icon={<MonitorSmartphone aria-hidden className="size-3.5" />}',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 260,
        code: 'icon: <MonitorSmartphone className="size-3.5" style={{ color: kindColors.screen }} />,',
        area: "app"
      },
      {
        file: "chrome/Inspector.tsx",
        line: 24,
        code: '{ value: "modes", label: "Modes", icon: MonitorSmartphone },',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1644,
        code: '<MonitorSmartphone className="size-3" aria-label="Changes at some screen sizes" />',
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 1033,
        code: "icon={MonitorSmartphone}",
        area: "exploration"
      },
      {
        file: "explorations/canvas-container/workspace.tsx",
        line: 30,
        code: '{ value: "modes", label: "Modes", icon: MonitorSmartphone }',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 803,
        code: "icon: MonitorSmartphone,",
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 65,
        code: '...(drawn.includes(lens) ? [{ value: "modes", label: "Modes", icon: MonitorSmartphone }] : [])',
        area: "exploration"
      }
    ],
    moreSites: 2,
    fluent: {
      name: "PhoneDesktop",
      file: "phone-desktop",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PhoneLaptop",
        file: "phone-laptop",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "TabletPhoneDesktop",
        file: "tablet-phone-desktop",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "Desktop",
        file: "desktop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PhoneTablet",
        file: "phone-tablet",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Moon",
    lucideKey: "Moon",
    context: "Dark theme",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/settings/definitions.ts",
        line: 122,
        code: '{ value: "dark", label: "Dark", icon: Moon },',
        area: "app"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 569,
        code: '<Moon className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "WeatherMoon",
      file: "weather-moon",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DarkTheme",
        file: "dark-theme",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CircleHalfFill",
        file: "circle-half-fill",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "WeatherPartlyCloudyNight",
        file: "weather-partly-cloudy-night",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "Star",
        file: "star",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "MoreHorizontal",
    lucideKey: "Ellipsis",
    context: "More actions",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/ModesPanel.tsx",
        line: 250,
        code: "<MoreHorizontal />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "MoreHorizontal",
      file: "more-horizontal",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "MoreVertical",
        file: "more-vertical",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "MoreCircle",
        file: "more-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Options",
        file: "options",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Navigation",
        file: "navigation",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MousePointer2",
    lucideKey: "MousePointer2",
    context: "Select tool, cursor preview",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/FloatingToolbar/tool-details.ts",
        line: 6,
        code: "select: MousePointer2,",
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 1088,
        code: '{createElement(cursorIcons.get(value) ?? MousePointer2, { className: large ? "size-7" : "size-3.5" })}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Cursor",
      file: "cursor",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CursorHover",
        file: "cursor-hover",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CursorClick",
        file: "cursor-click",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DesktopCursor",
        file: "desktop-cursor",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "HandPoint",
        file: "hand-point",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MousePointerClick",
    lucideKey: "MousePointerClick",
    context: "Interactions, clicks",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 140,
        code: '<MousePointerClick className="size-5" />',
        area: "app"
      },
      {
        file: "chrome/DesignPanel.tsx",
        line: 111,
        code: '<MousePointerClick className="size-5" />',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-kinds.ts",
        line: 9,
        code: 'behaviour: { name: "Behaviour", icon: MousePointerClick, hue: 250 },',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 72,
        code: "icon: MousePointerClick,",
        area: "app"
      },
      {
        file: "explorations/canvas-container/container-panel.tsx",
        line: 22,
        code: '<MousePointerClick className="size-5" />',
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 105,
        code: '<MousePointerClick className="size-5" />',
        area: "exploration"
      },
      {
        file: "explorations/screen-container/container-panel.tsx",
        line: 94,
        code: '<MousePointerClick className="size-5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CursorClick",
      file: "cursor-click",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Cursor",
        file: "cursor",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "CursorHover",
        file: "cursor-hover",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TapSingle",
        file: "tap-single",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "HandPoint",
        file: "hand-point",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Move",
    lucideKey: "Move",
    context: "Move cursor, relative position",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 159,
        code: '["move", Move],',
        area: "app"
      },
      {
        file: "inspector/controls/pin-box.tsx",
        line: 44,
        code: '{ value: "relative", label: "Relative", detail: "In layout, then moved by its insets", Icon: Move }',
        area: "app"
      },
      {
        file: "packages/presence-ui/src/AgentPointer.tsx",
        line: 95,
        code: "move: Move,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowMove",
      file: "arrow-move",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowMoveInward",
        file: "arrow-move-inward",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "Drag",
        file: "drag",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowExpand",
        file: "arrow-expand",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowsBidirectional",
        file: "arrows-bidirectional",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MoveDiagonal2",
    lucideKey: "MoveDiagonal2",
    context: "Pin box: resize",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/pin-box.tsx",
        line: 394,
        code: "<MoveDiagonal2 />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowMaximizeTopLeftBottomRight",
      file: "arrow-maximize-top-left-bottom-right",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowMaximize",
        file: "arrow-maximize",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowExpand",
        file: "arrow-expand",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Resize",
        file: "resize",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowFit",
        file: "arrow-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MoveHorizontal",
    lucideKey: "MoveHorizontal",
    context: "Letter spacing, ew-resize cursor",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 167,
        code: '["ew-resize", MoveHorizontal],',
        area: "app"
      },
      {
        file: "inspector/controls/font-fields.tsx",
        line: 1155,
        code: 'inner={<MoveHorizontal aria-hidden className="size-3.5" />}',
        area: "app"
      },
      {
        file: "inspector/controls/preset-text.tsx",
        line: 507,
        code: 'letterSpacing: <MoveHorizontal aria-hidden className="size-3.5" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowBidirectionalLeftRight",
      file: "arrow-bidirectional-left-right",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FontSpaceTrackingOut",
        file: "font-space-tracking-out",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowAutofitWidth",
        file: "arrow-autofit-width",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSwap",
        file: "arrow-swap",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowsBidirectional",
        file: "arrows-bidirectional",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MoveRight",
    lucideKey: "MoveRight",
    context: "Comment moved",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 793,
        code: "icon: MoveRight,",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowRight",
      file: "arrow-right",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowForward",
        file: "arrow-forward",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowNext",
        file: "arrow-next",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMove",
        file: "arrow-move",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCircleRight",
        file: "arrow-circle-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "MoveVertical",
    lucideKey: "MoveVertical",
    context: "Line height, ns-resize cursor",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 168,
        code: '["ns-resize", MoveVertical],',
        area: "app"
      },
      {
        file: "inspector/controls/font-fields.tsx",
        line: 847,
        code: 'inner={<MoveVertical aria-hidden className="size-3.5" />}',
        area: "app"
      },
      {
        file: "inspector/controls/preset-text.tsx",
        line: 506,
        code: 'lineHeight: <MoveVertical aria-hidden className="size-3.5" />,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowBidirectionalUpDown",
      file: "arrow-bidirectional-up-down",
      sizes: [12, 16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextLineSpacing",
        file: "text-line-spacing",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowAutofitHeight",
        file: "arrow-autofit-height",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSort",
        file: "arrow-sort",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMinimizeVertical",
        file: "arrow-minimize-vertical",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "NotebookPen",
    lucideKey: "NotebookPen",
    context: "Notes annotation",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 60,
        code: "icon: NotebookPen,",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 266,
        code: "icon: NotebookPen,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "NotepadEdit",
      file: "notepad-edit",
      sizes: [16, 20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "NoteEdit",
        file: "note-edit",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Notebook",
        file: "notebook",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "Note",
        file: "note",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentEdit",
        file: "document-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "NotebookText",
    lucideKey: "NotebookText",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 180,
        code: 'look: { hue: 276, brand: "Kestrel Help", icon: NotebookText, dark: true, org: "Kestrel" },',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 539,
        code: "look: starter(160, NotebookText, true),",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Notebook",
      file: "notebook",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Notepad",
        file: "notepad",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BookOpen",
        file: "book-open",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Note",
        file: "note",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentText",
        file: "document-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "OctagonAlert",
    lucideKey: "OctagonAlert",
    context: "Critical issue",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 45,
        code: 'critical: { label: "critical", icon: OctagonAlert, tone: "text-destructive" },',
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1610,
        code: '<OctagonAlert className="size-3 text-destructive" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ErrorCircle",
      file: "error-circle",
      sizes: [12, 16, 20, 24, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "AlertUrgent",
        file: "alert-urgent",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "ShieldError",
        file: "shield-error",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Warning",
        file: "warning",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Important",
        file: "important",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "OctagonX",
    lucideKey: "OctagonX",
    context: "Error toast",
    areas: ["story"],
    files: 1,
    sites: [
      {
        file: "chrome/ToastAudit.stories.tsx",
        line: 1210,
        code: 'error: <OctagonXIcon className="text-destructive" aria-hidden="true" />,',
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DismissCircle",
      file: "dismiss-circle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ErrorCircle",
        file: "error-circle",
        sizes: [12, 16, 20, 24, 48],
        unsized: true,
        color: true
      },
      {
        name: "Prohibited",
        file: "prohibited",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ShieldDismiss",
        file: "shield-dismiss",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "Warning",
        file: "warning",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Package",
    lucideKey: "Package",
    context: "Install process, packages",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 62,
        code: 'install: { icon: Package, tint: "oklch(0.76 0.15 65)", role: "Installs packages" },',
        area: "app"
      },
      {
        file: "explorations/code-panel/CodePanel.tsx",
        line: 178,
        code: "{source?.library ? <Package /> : <FileCode2 style={{ color: kindColors.component }} />}",
        area: "exploration"
      },
      {
        file: "explorations/portal/activity.tsx",
        line: 140,
        code: '<Package className="size-4 text-muted-foreground" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 22,
        code: "publish: Package,",
        area: "exploration"
      },
      {
        file: "explorations/portal/library.tsx",
        line: 239,
        code: '<Package className="size-5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Box",
      file: "box",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BoxMultiple",
        file: "box-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BoxArrowUp",
        file: "box-arrow-up",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Cube",
        file: "cube",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BoxCheckmark",
        file: "box-checkmark",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Paintbrush",
    lucideKey: "Paintbrush",
    context: "Copy style",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 80,
        code: "copyStyle: Paintbrush,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PaintBrush",
      file: "paint-brush",
      sizes: [12, 16, 20, 24, 28, 32],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PaintBrushArrowUp",
        file: "paint-brush-arrow-up",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PaintBucketBrush",
        file: "paint-bucket-brush",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Color",
        file: "color",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "Copy",
        file: "copy",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PaintRoller",
    lucideKey: "PaintRoller",
    context: "Paste style",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 81,
        code: "pasteStyle: PaintRoller,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ClipboardBrush",
      file: "clipboard-brush",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PaintBrushArrowDown",
        file: "paint-brush-arrow-down",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PaintBucket",
        file: "paint-bucket",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PaintBucketBrush",
        file: "paint-bucket-brush",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ColorFill",
        file: "color-fill",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Palette",
    lucideKey: "Palette",
    context: "Tokens tab, theme mode",
    areas: ["app", "exploration"],
    files: 9,
    sites: [
      {
        file: "chrome/ActionsSearch.tsx",
        line: 296,
        code: 'icon: <Palette className="text-muted-foreground" />,',
        area: "app"
      },
      {
        file: "chrome/AddLibraryDialog/TokenSpecimens.tsx",
        line: 53,
        code: '<SectionHeading id="library-tokens" icon={Palette} title="Tokens" count={tokens.length} />',
        area: "app"
      },
      {
        file: "chrome/LeftPanel.tsx",
        line: 28,
        code: '{ value: "tokens", label: "Tokens", icon: Palette },',
        area: "app"
      },
      {
        file: "chrome/ModesPanel.tsx",
        line: 45,
        code: "const kindIcons = { viewport: Monitor, theme: Palette, locale: Languages, custom: SlidersHorizontal }",
        area: "app"
      },
      {
        file: "chrome/StatusBar.tsx",
        line: 83,
        code: 'icon={<Palette className="size-3.5" />}',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 173,
        code: "icon: Palette,",
        area: "app"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 111,
        code: '{ value: "tokens", label: "Tokens", icon: Palette }',
        area: "exploration"
      },
      {
        file: "explorations/previews/frame.tsx",
        line: 27,
        code: '{ value: "tokens", label: "Tokens", icon: Palette }',
        area: "exploration"
      }
    ],
    moreSites: 1,
    fluent: {
      name: "Color",
      file: "color",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ColorFill",
        file: "color-fill",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "PaintBucket",
        file: "paint-bucket",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DesignIdeas",
        file: "design-ideas",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "StyleGuide",
        file: "style-guide",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PanelLeftClose",
    lucideKey: "PanelLeftClose",
    context: "Collapse left panel",
    areas: ["app", "exploration"],
    files: 3,
    sites: [
      {
        file: "chrome/SidePanel.tsx",
        line: 52,
        code: 'const Close = side === "left" ? PanelLeftClose : PanelRightClose',
        area: "app"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 62,
        code: 'const Close = side === "left" ? PanelLeftClose : PanelRightClose',
        area: "exploration"
      },
      {
        file: "explorations/previews/frame.tsx",
        line: 68,
        code: '<PanelLeftClose className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PanelLeftContract",
      file: "panel-left-contract",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PanelLeft",
        file: "panel-left",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleLeft",
        file: "chevron-double-left",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowStepInLeft",
        file: "arrow-step-in-left",
        sizes: [12, 16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "PanelLeftExpand",
        file: "panel-left-expand",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PanelLeftOpen",
    lucideKey: "PanelLeftOpen",
    context: "Expand left panel",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/SidePanel.tsx",
        line: 120,
        code: 'const Open = side === "left" ? PanelLeftOpen : PanelRightOpen',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PanelLeftExpand",
      file: "panel-left-expand",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PanelLeft",
        file: "panel-left",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleRight",
        file: "chevron-double-right",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowStepInRight",
        file: "arrow-step-in-right",
        sizes: [12, 16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "PanelLeftContract",
        file: "panel-left-contract",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PanelRightClose",
    lucideKey: "PanelRightClose",
    context: "Collapse right panel",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/SidePanel.tsx",
        line: 52,
        code: 'const Close = side === "left" ? PanelLeftClose : PanelRightClose',
        area: "app"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 62,
        code: 'const Close = side === "left" ? PanelLeftClose : PanelRightClose',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PanelRightContract",
      file: "panel-right-contract",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PanelRight",
        file: "panel-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleRight",
        file: "chevron-double-right",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowStepInRight",
        file: "arrow-step-in-right",
        sizes: [12, 16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "PanelRightExpand",
        file: "panel-right-expand",
        sizes: [20, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PanelRightOpen",
    lucideKey: "PanelRightOpen",
    context: "Expand right panel",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/SidePanel.tsx",
        line: 120,
        code: 'const Open = side === "left" ? PanelLeftOpen : PanelRightOpen',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PanelRightExpand",
      file: "panel-right-expand",
      sizes: [20, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PanelRight",
        file: "panel-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleLeft",
        file: "chevron-double-left",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowStepInLeft",
        file: "arrow-step-in-left",
        sizes: [12, 16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "PanelRightContract",
        file: "panel-right-contract",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PanelsLeftRight",
    lucideKey: "Columns3",
    context: "Show panels toggle",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 267,
        code: "icon={PanelsLeftRight}",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 360,
        code: '<PanelsLeftRight className="size-4" /> Panels',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LayoutColumnThree",
      file: "layout-column-three",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PanelLeft",
        file: "panel-left",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PanelRight",
        file: "panel-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SplitVertical",
        file: "split-vertical",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PanelSeparateWindow",
        file: "panel-separate-window",
        sizes: [20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PanelsTopLeft",
    lucideKey: "PanelsTopLeft",
    context: "Panels element kind",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 37,
        code: '"panels-top-left": PanelsTopLeft,',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 231,
        code: "icon: PanelsTopLeft,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PanelLeftHeader",
      file: "panel-left-header",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LayoutColumnOneThirdLeft",
        file: "layout-column-one-third-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Board",
        file: "board",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Window",
        file: "window",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PanelLeft",
        file: "panel-left",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Paperclip",
    lucideKey: "Paperclip",
    context: "Attach",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 701,
        code: "<Paperclip />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 1194,
        code: '<Paperclip className="size-3" /> {attached}',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 1175,
        code: '<Paperclip className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Attach",
      file: "attach",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AttachArrowRight",
        file: "attach-arrow-right",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AttachText",
        file: "attach-text",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Link",
        file: "link",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "DocumentAdd",
        file: "document-add",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Pause",
    lucideKey: "Pause",
    context: "Pause playback",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/TokenDetail.tsx",
        line: 163,
        code: '<Hint label={playing ? "Pause" : "Play"}>',
        area: "app"
      },
      {
        file: "chrome/TokenDetail.tsx",
        line: 169,
        code: 'aria-label={playing ? "Pause" : "Play"}',
        area: "app"
      },
      {
        file: "chrome/TokenDetail.tsx",
        line: 173,
        code: "{playing ? <Pause /> : <Play />}",
        area: "app"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 545,
        code: '<Hint label={playing ? "Pause" : "Play"}>',
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 551,
        code: 'aria-label={playing ? "Pause" : "Play"}',
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 555,
        code: "{playing ? <Pause /> : <Play />}",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 360,
        code: '<Pause className="size-5" />',
        area: "exploration"
      },
      {
        file: "stories/Playback.tsx",
        line: 23,
        code: "{running ? <Pause /> : <Play />}",
        area: "app"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "Pause",
      file: "pause",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PauseCircle",
        file: "pause-circle",
        sizes: [12, 16, 20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "RecordStop",
        file: "record-stop",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Stop",
        file: "stop",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PlayCircle",
        file: "play-circle",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PawPrint",
    lucideKey: "PawPrint",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 148,
        code: 'look: { hue: 52, brand: "Walkies", icon: PawPrint, serif: true },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AnimalPawPrint",
      file: "animal-paw-print",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "AnimalDog",
        file: "animal-dog",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AnimalCat",
        file: "animal-cat",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "AnimalRabbit",
        file: "animal-rabbit",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "Heart",
        file: "heart",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Pencil",
    lucideKey: "Pencil",
    context: "Edit",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/TokenDetail.tsx",
        line: 322,
        code: "<Pencil /> Edit",
        area: "app"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 301,
        code: "<Pencil /> Edit",
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 691,
        code: "<Pencil /> Edit",
        area: "exploration"
      },
      {
        file: "inspector/sections/PropsSection.tsx",
        line: 816,
        code: "<Pencil /> Rename",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Edit",
      file: "edit",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Pen",
        file: "pen",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Rename",
        file: "rename",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "EditSettings",
        file: "edit-settings",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "NoteEdit",
        file: "note-edit",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PenLine",
    lucideKey: "PenLine",
    context: "Rename, changed by an agent",
    areas: ["app", "exploration"],
    files: 4,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 82,
        code: "rename: PenLine,",
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1633,
        code: "<PenLine",
        area: "app"
      },
      {
        file: "explorations/screen-container/container-layers.tsx",
        line: 325,
        code: '<PenLine className="size-3" style={{ color: kindColors.agent }} aria-label={`Changed in ${state.name}`} />',
        area: "exploration"
      },
      {
        file: "packages/presence-ui/src/AgentPointer.tsx",
        line: 94,
        code: "write: PenLine,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Rename",
      file: "rename",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Edit",
        file: "edit",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "RenameA",
        file: "rename-a",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "TextEditStyle",
        file: "text-edit-style",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: true
      },
      {
        name: "Pen",
        file: "pen",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PenTool",
    lucideKey: "PenTool",
    context: "Pen element kind",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 52,
        code: '"pen-tool": PenTool,',
        area: "app"
      },
      {
        file: "media/MediaCard.tsx",
        line: 13,
        code: "export const mediumIcons: Record<ImageMedium, LucideIcon> = { image: ImageIcon, vector: PenTool, video: Film }",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Pen",
      file: "pen",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BezierCurveSquare",
        file: "bezier-curve-square",
        sizes: [12, 20],
        unsized: true,
        color: false
      },
      {
        name: "InkingTool",
        file: "inking-tool",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "CalligraphyPen",
        file: "calligraphy-pen",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DrawShape",
        file: "draw-shape",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Percent",
    lucideKey: "Percent",
    context: "Zoom to 100%",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 117,
        code: "zoomTo100: Percent,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "RatioOneToOne",
      file: "ratio-one-to-one",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextPercent",
        file: "text-percent",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Multiplier1X",
        file: "multiplier-1-x",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ZoomFit",
        file: "zoom-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ZoomIn",
        file: "zoom-in",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "PictureInPicture2",
    lucideKey: "PictureInPicture2",
    context: "Picture-in-picture element kind",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 59,
        code: '"picture-in-picture-2": PictureInPicture2',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PictureInPicture",
      file: "picture-in-picture",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PictureInPictureEnter",
        file: "picture-in-picture-enter",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PictureInPictureExit",
        file: "picture-in-picture-exit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "WindowNew",
        file: "window-new",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Window",
        file: "window",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Pilcrow",
    lucideKey: "Pilcrow",
    context: "Content annotation",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "collaboration/annotations/annotation-kinds.ts",
        line: 10,
        code: 'content: { name: "Content", icon: Pilcrow, hue: 150 },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextParagraph",
      file: "text-paragraph",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextT",
        file: "text-t",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextFont",
        file: "text-font",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextDescription",
        file: "text-description",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "TextParagraphDirectionLeft",
        file: "text-paragraph-direction-left",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Pipette",
    lucideKey: "Pipette",
    context: "Eyedropper",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 48,
        code: "pipette: Pipette,",
        area: "app"
      },
      {
        file: "inspector/controls/color-picker.tsx",
        line: 260,
        code: "<Pipette />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Eyedropper",
      file: "eyedropper",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Color",
        file: "color",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ColorLine",
        file: "color-line",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "PaintBrush",
        file: "paint-brush",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Drop",
        file: "drop",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Play",
    lucideKey: "Play",
    context: "Play playback",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/TokenDetail.tsx",
        line: 61,
        code: "* button on the preview to stop it; with reduced motion it waits for Play.",
        area: "app"
      },
      {
        file: "chrome/TokenDetail.tsx",
        line: 163,
        code: '<Hint label={playing ? "Pause" : "Play"}>',
        area: "app"
      },
      {
        file: "chrome/TokenDetail.tsx",
        line: 169,
        code: 'aria-label={playing ? "Pause" : "Play"}',
        area: "app"
      },
      {
        file: "chrome/TokenDetail.tsx",
        line: 173,
        code: "{playing ? <Pause /> : <Play />}",
        area: "app"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 487,
        code: "* stop it; with reduced motion it waits for Play.",
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 545,
        code: '<Hint label={playing ? "Pause" : "Play"}>',
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 551,
        code: 'aria-label={playing ? "Pause" : "Play"}',
        area: "exploration"
      },
      {
        file: "explorations/previews/token-panels.tsx",
        line: 555,
        code: "{playing ? <Pause /> : <Play />}",
        area: "exploration"
      }
    ],
    moreSites: 6,
    fluent: {
      name: "Play",
      file: "play",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PlayCircle",
        file: "play-circle",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "FastForward",
        file: "fast-forward",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Video",
        file: "video",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Next",
        file: "next",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Plug",
    lucideKey: "Plug",
    context: "Component needs a provider",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/ComponentCard.tsx",
        line: 229,
        code: '"needs-provider": Plug,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PlugDisconnected",
      file: "plug-disconnected",
      sizes: [16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "PlugConnected",
        file: "plug-connected",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PlugPuzzle",
        file: "plug-puzzle",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "PlugConnectedSettings",
        file: "plug-connected-settings",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Connector",
        file: "connector",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Plus",
    lucideKey: "Plus",
    context: "Add",
    areas: ["app", "exploration", "story"],
    files: 35,
    sites: [
      {
        file: "account/AccountMenu.tsx",
        line: 106,
        code: '<Plus className="size-4" />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1208,
        code: "<Plus />",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1259,
        code: "<Plus />",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1422,
        code: "<Plus /> Add Lucide",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 188,
        code: "<Plus /> Insert",
        area: "app"
      },
      {
        file: "chrome/ExportSection.tsx",
        line: 38,
        code: "<Plus />",
        area: "app"
      },
      {
        file: "chrome/LayerTree.tsx",
        line: 1242,
        code: "<Plus />",
        area: "app"
      },
      {
        file: "chrome/ModesPanel.tsx",
        line: 101,
        code: "<Plus />",
        area: "app"
      }
    ],
    moreSites: 41,
    fluent: {
      name: "Add",
      file: "add",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "AddCircle",
        file: "add-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "AddSquare",
        file: "add-square",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "AddSquareMultiple",
        file: "add-square-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AddStarburst",
        file: "add-starburst",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Pointer",
    lucideKey: "Pointer",
    context: "Pointer cursor, annotation",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 154,
        code: '["pointer", Pointer],',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 79,
        code: "icon: Pointer,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "HandPoint",
      file: "hand-point",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CursorClick",
        file: "cursor-click",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Cursor",
        file: "cursor",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "TapSingle",
        file: "tap-single",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "HandRight",
        file: "hand-right",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Puzzle",
    lucideKey: "Puzzle",
    context: "Extensions",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/settings/definitions.ts",
        line: 105,
        code: '{ id: "extensions", label: "Extensions", icon: Puzzle, group: 1 },',
        area: "app"
      },
      {
        file: "chrome/settings/extension-list.ts",
        line: 94,
        code: "icon: extensionMark(entry.prefix ?? entry.id, entry.icon, entry.name) ?? Puzzle,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PuzzlePiece",
      file: "puzzle-piece",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PuzzleCube",
        file: "puzzle-cube",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "AppsAddIn",
        file: "apps-add-in",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PlugPuzzle",
        file: "plug-puzzle",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Apps",
        file: "apps",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Quote",
    lucideKey: "Quote",
    context: "Quote annotation",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 126,
        code: "icon: Quote,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextQuote",
      file: "text-quote",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextQuoteOpening",
        file: "text-quote-opening",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "CommentQuote",
        file: "comment-quote",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "TooltipQuote",
        file: "tooltip-quote",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Chat",
        file: "chat",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "RectangleHorizontal",
    lucideKey: "RectangleHorizontal",
    context: "Landscape filter",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "library/FilterControls.tsx",
        line: 33,
        code: "return <RectangleHorizontal />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "RectangleLandscape",
      file: "rectangle-landscape",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Orientation",
        file: "orientation",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Square",
        file: "square",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ResizeLarge",
        file: "resize-large",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TabDesktop",
        file: "tab-desktop",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "RectangleVertical",
    lucideKey: "RectangleVertical",
    context: "Portrait filter",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "library/FilterControls.tsx",
        line: 35,
        code: "return <RectangleVertical />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "RectanglePortrait",
      file: "rectangle-portrait",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "OrientationPortrait",
        file: "orientation-portrait",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Phone",
        file: "phone",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Square",
        file: "square",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Tablet",
        file: "tablet",
        sizes: [12, 16, 20, 24, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Redo2",
    lucideKey: "Redo2",
    context: "Redo",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 70,
        code: "redo: Redo2,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowRedo",
      file: "arrow-redo",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowClockwise",
        file: "arrow-clockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowForward",
        file: "arrow-forward",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRotateClockwise",
        file: "arrow-rotate-clockwise",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "RefreshCw",
    lucideKey: "RefreshCw",
    context: "Refresh, check again",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 198,
        code: '<RefreshCw className={checking ? "animate-spin" : undefined} />',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 230,
        code: "<RefreshCw /> Check again",
        area: "app"
      },
      {
        file: "chrome/AppMenu.tsx",
        line: 374,
        code: "<RefreshCw /> Check for updates",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 353,
        code: '<RefreshCw className="size-2.5" />',
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 107,
        code: '{ id: "updates", label: "Updates", icon: RefreshCw, group: 2 }',
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 402,
        code: "<RefreshCw /> Check for updates",
        area: "exploration"
      },
      {
        file: "explorations/portal/library.tsx",
        line: 201,
        code: "<RefreshCw /> Update",
        area: "exploration"
      },
      {
        file: "explorations/portal/library.tsx",
        line: 216,
        code: "<RefreshCw /> Update both to 2.4",
        area: "exploration"
      }
    ],
    moreSites: 1,
    fluent: {
      name: "ArrowSync",
      file: "arrow-sync",
      sizes: [12, 16, 20, 24],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ArrowClockwise",
        file: "arrow-clockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSyncCircle",
        file: "arrow-sync-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowCounterclockwise",
        file: "arrow-counterclockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Repeat2",
    lucideKey: "Repeat2",
    context: "Repeat last action",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 71,
        code: "repeat: Repeat2,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowRepeatAll",
      file: "arrow-repeat-all",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowRepeat1",
        file: "arrow-repeat",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Replay",
        file: "replay",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSync",
        file: "arrow-sync",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "ArrowClockwise",
        file: "arrow-clockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Replace",
    lucideKey: "Replace",
    context: "Paste to replace, swap component",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 76,
        code: "pasteReplace: Replace,",
        area: "app"
      },
      {
        file: "inspector/controls/instance-section.tsx",
        line: 332,
        code: "<Replace /> Swap component",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowSwap",
      file: "arrow-swap",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ClipboardArrowRight",
        file: "clipboard-arrow-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "WindowMultipleSwap",
        file: "window-multiple-swap",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSync",
        file: "arrow-sync",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Rocket",
    lucideKey: "Rocket",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 246,
        code: 'look: { hue: 230, brand: "Kestrel Cloud", icon: Rocket, org: "Kestrel" },',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 501,
        code: "look: starter(18, Rocket),",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 358,
        code: '{ label: "Deploys", icon: Rocket },',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 760,
        code: '{ label: "Deploys", icon: Rocket },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Rocket",
      file: "rocket",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Airplane",
        file: "airplane",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Flash",
        file: "flash",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "Sparkle",
        file: "sparkle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowUp",
        file: "arrow-up",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "RotateCcw",
    lucideKey: "RotateCcw",
    context: "Reset, revert",
    areas: ["app", "exploration"],
    files: 10,
    sites: [
      {
        file: "canvas/preview-parts.tsx",
        line: 331,
        code: "<RotateCcw />",
        area: "app"
      },
      {
        file: "canvas/preview-parts.tsx",
        line: 441,
        code: '<RotateCcw className="size-3" />',
        area: "app"
      },
      {
        file: "chrome/ErrorBoundary.tsx",
        line: 265,
        code: "{!reopen && <RotateCcw />}",
        area: "app"
      },
      {
        file: "chrome/ErrorBoundary.tsx",
        line: 442,
        code: "{!strip && <RotateCcw />}",
        area: "app"
      },
      {
        file: "chrome/LayerPanel.tsx",
        line: 571,
        code: "<RotateCcw />",
        area: "app"
      },
      {
        file: "chrome/settings/shortcuts.tsx",
        line: 102,
        code: "<RotateCcw aria-hidden /> Reset all shortcuts",
        area: "app"
      },
      {
        file: "chrome/settings/shortcuts.tsx",
        line: 212,
        code: "icon={<RotateCcw />}",
        area: "app"
      },
      {
        file: "chrome/TriedSize.tsx",
        line: 32,
        code: "<RotateCcw aria-hidden />",
        area: "app"
      }
    ],
    moreSites: 6,
    fluent: {
      name: "ArrowCounterclockwise",
      file: "arrow-counterclockwise",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowReset",
        file: "arrow-reset",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowUndo",
        file: "arrow-undo",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRotateCounterclockwise",
        file: "arrow-rotate-counterclockwise",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "History",
        file: "history",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "RotateCw",
    lucideKey: "RotateCw",
    context: "Reload, retry",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/ErrorBoundary.tsx",
        line: 386,
        code: "{!reload && <RotateCw />}",
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 140,
        code: "<RotateCw /> Restart",
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 147,
        code: "<RotateCw />",
        area: "app"
      },
      {
        file: "chrome/ExtensionView.tsx",
        line: 110,
        code: "<RotateCw /> Restart",
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 526,
        code: "<RotateCw />",
        area: "app"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 55,
        code: '<RotateCw className="size-3.5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowClockwise",
      file: "arrow-clockwise",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowSync",
        file: "arrow-sync",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "ArrowRotateClockwise",
        file: "arrow-rotate-clockwise",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRedo",
        file: "arrow-redo",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowRepeatAll",
        file: "arrow-repeat-all",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Route",
    lucideKey: "Route",
    context: "Route kind, page boards",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 163,
        code: "return <Route {...props} />",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 221,
        code: "return node.component ? <Diamond {...props} /> : <Route {...props} />",
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 184,
        code: 'title: "Route",',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 187,
        code: "icon: Route,",
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 988,
        code: 'const Icon = board.kind === "page" ? Route : Bookmark',
        area: "exploration"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 47,
        code: "Icon: Route,",
        area: "exploration"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 192,
        code: 'page: { icon: Route, color: kindColors.screen, word: "Page" },',
        area: "exploration"
      },
      {
        file: "lenses/pages.tsx",
        line: 20,
        code: "Icon: Route,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Flow",
      file: "flow",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowRouting",
        file: "arrow-routing",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Directions",
        file: "directions",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Map",
        file: "map",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowFlowUpRight",
        file: "arrow-flow-up-right",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Rows3",
    lucideKey: "Rows3",
    context: "Column layout (children stacked)",
    areas: ["app", "story"],
    files: 8,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 36,
        code: '"rows-3": Rows3,',
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 233,
        code: 'return node.style?.flexDirection === "row" ? <Columns3 {...props} /> : <Rows3 {...props} />',
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 92,
        code: "icon: Rows3,",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 71,
        code: 'const Icon = node.style?.flexDirection === "row" ? Columns3 : Rows3',
        area: "app"
      },
      {
        file: "inspector/controls/grid-cell.tsx",
        line: 212,
        code: '{across ? <Columns3 className="size-3.5" /> : <Rows3 className="size-3.5" />}',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1067,
        code: 'inner={<Rows3 className="size-3" />}',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1077,
        code: 'inner={columns ? <Columns3 className="size-3" /> : <Rows3 className="size-3" />}',
        area: "app"
      },
      {
        file: "inspector/controls/layout-controls.tsx",
        line: 1162,
        code: 'inner={columns ? <Columns3 className="size-3" /> : <Rows3 className="size-3" />}',
        area: "app"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "LayoutRowThree",
      file: "layout-row-three",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LayoutRowTwo",
        file: "layout-row-two",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "RowTriple",
        file: "row-triple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "List",
        file: "list",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "TableSimple",
        file: "table-simple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Ruler",
    lucideKey: "Ruler",
    context: "Breakpoints, measure",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/AddLibraryDialog/Breakpoints.tsx",
        line: 21,
        code: '<SectionHeading id="library-breakpoints" icon={Ruler} title="Breakpoints" count={breakpoints.length} />',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 140,
        code: "icon: Ruler,",
        area: "app"
      },
      {
        file: "packages/presence-ui/src/AgentPointer.tsx",
        line: 97,
        code: "measure: Ruler,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Ruler",
      file: "ruler",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowAutofitWidth",
        file: "arrow-autofit-width",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Resize",
        file: "resize",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DividerTall",
        file: "divider-tall",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowFit",
        file: "arrow-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Save",
    lucideKey: "Save",
    context: "Save",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 123,
        code: "save: Save,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Save",
      file: "save",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SaveEdit",
        file: "save-edit",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "SaveArrowRight",
        file: "save-arrow-right",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SaveSync",
        file: "save-sync",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowDownload",
        file: "arrow-download",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SaveAll",
    lucideKey: "SaveAll",
    context: "Save a copy",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 124,
        code: "saveCopy: SaveAll,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SaveCopy",
      file: "save-copy",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SaveMultiple",
        file: "save-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Save",
        file: "save",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "DocumentCopy",
        file: "document-copy",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "CopyArrowRight",
        file: "copy-arrow-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Scan",
    lucideKey: "Scan",
    context: "Zoom to selection",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 119,
        code: "zoomToSelection: Scan,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ScanDash",
      file: "scan-dash",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Scan",
        file: "scan",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ZoomFit",
        file: "zoom-fit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SelectObject",
        file: "select-object",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "FullScreenMaximize",
        file: "full-screen-maximize",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ScanSearch",
    lucideKey: "ScanSearch",
    context: "Find repeated parts, search deeper",
    areas: ["app", "exploration"],
    files: 3,
    sites: [
      {
        file: "chrome/ComponentsSection.tsx",
        line: 29,
        code: "<ScanSearch /> Find repeated parts",
        area: "app"
      },
      {
        file: "explorations/screen-container/container-panel.tsx",
        line: 366,
        code: "<ScanSearch /> Find repeated parts",
        area: "exploration"
      },
      {
        file: "library/LibraryBrowser.tsx",
        line: 360,
        code: "<ScanSearch /> Search deeper",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SearchVisual",
      file: "search-visual",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ScanObject",
        file: "scan-object",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SearchSquare",
        file: "search-square",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ImageSearch",
        file: "image-search",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DocumentSearch",
        file: "document-search",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Scissors",
    lucideKey: "Scissors",
    context: "Cut",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 72,
        code: "cut: Scissors,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Cut",
      file: "cut",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ScreenCut",
        file: "screen-cut",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "Crop",
        file: "crop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Delete",
        file: "delete",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Dismiss",
        file: "dismiss",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ScrollText",
    lucideKey: "ScrollText",
    context: "Extension log",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/ExtensionLog.tsx",
        line: 167,
        code: "<ScrollText />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Script",
      file: "script",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextBulletListSquare",
        file: "text-bullet-list-square",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "DocumentText",
        file: "document-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Notepad",
        file: "notepad",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "DocumentBulletList",
        file: "document-bullet-list",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Search",
    lucideKey: "Search",
    context: "Search fields",
    areas: ["app", "exploration"],
    files: 29,
    sites: [
      {
        file: "canvas/preview-parts.tsx",
        line: 166,
        code: 'inner={<Search aria-hidden className="size-3.5" />}',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 143,
        code: '<Search className="pointer-events-none absolute top-1/2 left-4 mt-1 size-3.5 -translate-y-1/2 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 450,
        code: '<SearchField value={query} onChange={setQuery} placeholder="Search components" />',
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1482,
        code: "placeholder={`Search ${all.length} ${iconsOf(library)}`}",
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 129,
        code: "actions: Search,",
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 167,
        code: "<Search />",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/FloatingToolbar.tsx",
        line: 14,
        code: "* or a search (PAR-893): Insert, Find references, and Search actions for every command the toolbar leaves out. Picking",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/FloatingToolbar.tsx",
        line: 42,
        code: "<Search />",
        area: "app"
      }
    ],
    moreSites: 60,
    fluent: {
      name: "Search",
      file: "search",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SearchSquare",
        file: "search-square",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SearchSparkle",
        file: "search-sparkle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Filter",
        file: "filter",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ZoomIn",
        file: "zoom-in",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SearchCheck",
    lucideKey: "SearchCheck",
    context: "Lint process",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 66,
        code: 'lint: { icon: SearchCheck, tint: "oklch(0.82 0.15 98)", role: "Lints files" },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextGrammarCheckmark",
      file: "text-grammar-checkmark",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DocumentSearch",
        file: "document-search",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "CheckmarkCircleSquare",
        file: "checkmark-circle-square",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ScanText",
        file: "scan-text",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SearchShield",
        file: "search-shield",
        sizes: [20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Send",
    lucideKey: "Send",
    context: "Send, ask to comment",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/portal/share.tsx",
        line: 219,
        code: "<Send /> Ask to comment",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 1165,
        code: '<Send className="size-3.5" /> Send',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 1178,
        code: '<Send className="size-4" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Send",
      file: "send",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "SendClock",
        file: "send-clock",
        sizes: [20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "ArrowRight",
        file: "arrow-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Mail",
        file: "mail",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Share",
        file: "share",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SeparatorHorizontal",
    lucideKey: "SeparatorHorizontal",
    context: "Separator element kind",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 58,
        code: '"separator-horizontal": SeparatorHorizontal,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LineHorizontal1",
      file: "line-horizontal",
      sizes: [16, 20, 24, 28],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LineHorizontal1Dashes",
        file: "line-horizontal-1-dashes",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DividerShort",
        file: "divider-short",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Subtract",
        file: "subtract",
        sizes: [12, 16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "LineDashes",
        file: "line-dashes",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Server",
    lucideKey: "Server",
    context: "API routes, servers, server-only",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/ApiRoutes.tsx",
        line: 126,
        code: '<Server className="size-3.5 shrink-0" style={{ color: apiColor }} />',
        area: "app"
      },
      {
        file: "chrome/ApiRoutes.tsx",
        line: 153,
        code: "<Server />",
        area: "app"
      },
      {
        file: "chrome/ApiRoutes.tsx",
        line: 171,
        code: "icon={<Server className={headingIcon} />}",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 230,
        code: '"server-only": Server,',
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 61,
        code: 'tool: { icon: Server, tint: "oklch(0.68 0.2 2)", role: "Serves a tool" },',
        area: "app"
      },
      {
        file: "explorations/lenses/data.ts",
        line: 106,
        code: "Icon: Server,",
        area: "exploration"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 104,
        code: "const outlineIcons: Partial<Record<LensId, LucideIcon>> = { data: Table2, api: Server }",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Server",
      file: "server",
      sizes: [12, 16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ServerMultiple",
        file: "server-multiple",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "ServerSurface",
        file: "server-surface",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "Database",
        file: "database",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "HardDrive",
        file: "hard-drive",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Settings",
    lucideKey: "Settings",
    context: "Settings",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 127,
        code: "settings: Settings,",
        area: "app"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 267,
        code: "<Settings />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 446,
        code: "* then desktop notifications and email. Settings for all projects are the default; a project can have its own.",
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 171,
        code: '<NavItem icon={<Settings className="size-4" />} label="Kestrel settings" active={active === "settings"} />',
        area: "exploration"
      },
      {
        file: "explorations/portal/search.tsx",
        line: 69,
        code: '<Pills options={["All 9", "Designs 3", "Components 3", "Comments 2", "Settings 1"]} />',
        area: "exploration"
      },
      {
        file: "explorations/portal/search.tsx",
        line: 140,
        code: '<Group title="Settings" count={1}>',
        area: "exploration"
      },
      {
        file: "explorations/portal/search.tsx",
        line: 142,
        code: '<Settings className="size-4 shrink-0 text-muted-foreground" />',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 457,
        code: '<Settings /> Settings <DropdownMenuShortcut>{formatKeys("Ctrl ,")}</DropdownMenuShortcut>',
        area: "exploration"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "Settings",
      file: "settings",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "SettingsCogMultiple",
        file: "settings-cog-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Options",
        file: "options",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Wrench",
        file: "wrench",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "Toolbox",
        file: "toolbox",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Settings2",
    lucideKey: "Settings2",
    context: "Board options, view settings",
    areas: ["app", "exploration"],
    files: 3,
    sites: [
      {
        file: "canvas/BoardMenus.tsx",
        line: 96,
        code: "<Settings2 />",
        area: "app"
      },
      {
        file: "canvas/element-kinds.tsx",
        line: 46,
        code: '"settings-2": Settings2,',
        area: "app"
      },
      {
        file: "explorations/canvas-container/view-lists.tsx",
        line: 33,
        code: "<Settings2 />",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Options",
      file: "options",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Settings",
        file: "settings",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ContentSettings",
        file: "content-settings",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "SettingsCogMultiple",
        file: "settings-cog-multiple",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SlideSettings",
        file: "slide-settings",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Shapes",
    lucideKey: "Shapes",
    context: "Quick insert: shapes",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/QuickInsert.tsx",
        line: 27,
        code: "// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- lucide names this icon Shapes; it is InsertIcon here.",
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 468,
        code: '<InsertIcon className="size-3.5" /> {line.text}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Shapes",
      file: "shapes",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ShapeUnion",
        file: "shape-union",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShapeOrganic",
        file: "shape-organic",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Square",
        file: "square",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Circle",
        file: "circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ShieldCheck",
    lucideKey: "ShieldCheck",
    context: "Verified, admin",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 147,
        code: '<ShieldCheck className="size-3.5 shrink-0" aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/Processes.tsx",
        line: 67,
        code: 'verify: { icon: ShieldCheck, tint: "oklch(0.75 0.13 175)", role: "Verifies the project" },',
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 106,
        code: '{ id: "diagnostics", label: "Diagnostics", icon: ShieldCheck, group: 2 },',
        area: "app"
      },
      {
        file: "explorations/portal/admin.tsx",
        line: 728,
        code: '<ShieldCheck className="size-3.5" />',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 915,
        code: '<ShieldCheck className="size-4" /> Superwalker',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ShieldCheckmark",
      file: "shield-checkmark",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Shield",
        file: "shield",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ShieldTask",
        file: "shield-task",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LockShield",
        file: "lock-shield",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "CheckmarkCircle",
        file: "checkmark-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "ShoppingBag",
    lucideKey: "ShoppingBag",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 592,
        code: "look: { ...starter(0, ShoppingBag), mono: true },",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ShoppingBag",
      file: "shopping-bag",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Cart",
        file: "cart",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BuildingShop",
        file: "building-shop",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShoppingBagTag",
        file: "shopping-bag-tag",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Money",
        file: "money",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Signal",
    lucideKey: "Signal",
    context: "Device status bar mock",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/render-kit.tsx",
        line: 188,
        code: '<Signal className="size-4" strokeWidth={2.5} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CellularData1",
      file: "cellular-data",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CellularData2",
        file: "cellular-data",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CellularData3",
        file: "cellular-data",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Cellular5G",
        file: "cellular-5-g",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Wifi1",
        file: "wifi",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Skull",
    lucideKey: "Skull",
    context: "Sample game mark (Fluent has no skull)",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 138,
        code: 'mark = <Skull className="size-10" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Games",
      file: "games",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Chess",
        file: "chess",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Fire",
        file: "fire",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "EmojiAngry",
        file: "emoji-angry",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Trophy",
        file: "trophy",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "SlidersHorizontal",
    lucideKey: "SlidersHorizontal",
    context: "Design tab, props, custom mode",
    areas: ["app", "exploration"],
    files: 12,
    sites: [
      {
        file: "canvas/preview-parts.tsx",
        line: 247,
        code: '<SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />',
        area: "app"
      },
      {
        file: "chrome/Inspector.tsx",
        line: 23,
        code: '{ value: "design", label: "Design", icon: SlidersHorizontal },',
        area: "app"
      },
      {
        file: "chrome/ModesPanel.tsx",
        line: 45,
        code: "const kindIcons = { viewport: Monitor, theme: Palette, locale: Languages, custom: SlidersHorizontal }",
        area: "app"
      },
      {
        file: "chrome/settings/definitions.ts",
        line: 101,
        code: '{ id: "general", label: "General", icon: SlidersHorizontal, group: 0 },',
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 1466,
        code: '<SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />',
        area: "exploration"
      },
      {
        file: "explorations/canvas-container/workspace.tsx",
        line: 29,
        code: '{ value: "design", label: "Design", icon: SlidersHorizontal },',
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 64,
        code: '{ value: "design", label: info.inspector, icon: lens === "data" ? Table2 : SlidersHorizontal },',
        area: "exploration"
      },
      {
        file: "explorations/screen-container/workspace.tsx",
        line: 66,
        code: '{ value: "design", label: "Design", icon: SlidersHorizontal },',
        area: "exploration"
      }
    ],
    moreSites: 4,
    fluent: {
      name: "Options",
      file: "options",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Settings",
        file: "settings",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ContentSettings",
        file: "content-settings",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Filter",
        file: "filter",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "DataUsageSettings",
        file: "data-usage-settings",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Smartphone",
    lucideKey: "Smartphone",
    context: "Phone viewport",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/viewports.tsx",
        line: 27,
        code: "const deviceIcons = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor }",
        area: "app"
      },
      {
        file: "library/FilterControls.tsx",
        line: 31,
        code: "return <Smartphone />",
        area: "app"
      },
      {
        file: "library/LargerView.tsx",
        line: 47,
        code: '{found.platform === "ios" ? <Smartphone /> : <Monitor />} {found.platform === "ios" ? "iOS" : "Web"}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Phone",
      file: "phone",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PhoneTablet",
        file: "phone-tablet",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PhoneLaptop",
        file: "phone-laptop",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "PhoneDesktop",
        file: "phone-desktop",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PhoneStatusBar",
        file: "phone-status-bar",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Smile",
    lucideKey: "FaceSlightlySmiling",
    context: "Icons tab, icon kind, emoji",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "canvas/kinds.tsx",
        line: 182,
        code: "* A layer's kind as an icon. An icon layer shows Smile, the Icons tab's icon, whatever it draws (PAR-793): its own glyph",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 212,
        code: "return isIconLayer(node, libraries ?? project?.info.libraries ?? []) ? <Smile {...props} /> : <Diamond {...props} />",
        area: "app"
      },
      {
        file: "chrome/AssetsPanel.tsx",
        line: 1416,
        code: '<Smile className="size-6" />',
        area: "app"
      },
      {
        file: "chrome/LeftPanel.tsx",
        line: 26,
        code: '{ value: "icons", label: "Icons", icon: Smile },',
        area: "app"
      },
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 34,
        code: '["smileys", Smile],',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 205,
        code: "const Icon = categoryIcons.get(candidate.id) ?? Smile",
        area: "exploration"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 109,
        code: '{ value: "icons", label: "Icons", icon: Smile },',
        area: "exploration"
      },
      {
        file: "explorations/previews/frame.tsx",
        line: 25,
        code: '{ value: "icons", label: "Icons", icon: Smile },',
        area: "exploration"
      }
    ],
    moreSites: 1,
    fluent: {
      name: "Emoji",
      file: "emoji",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Icons",
        file: "icons",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "EmojiSmileSlight",
        file: "emoji-smile-slight",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "EmojiLaugh",
        file: "emoji-laugh",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "EmojiHint",
        file: "emoji-hint",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SmilePlus",
    lucideKey: "FaceSlightlySmilingPlus",
    context: "Add reaction",
    areas: ["exploration"],
    files: 2,
    sites: [
      {
        file: "explorations/collaboration/comments.tsx",
        line: 278,
        code: "<SmilePlus />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 679,
        code: "<SmilePlus />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/emoji.tsx",
        line: 389,
        code: '<SmilePlus className="size-3.5" />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "EmojiAdd",
      file: "emoji-add",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Emoji",
        file: "emoji",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "EmojiSmileSlight",
        file: "emoji-smile-slight",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "EmojiHand",
        file: "emoji-hand",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Heart",
        file: "heart",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Sparkles",
    lucideKey: "Sparkles",
    context: "Extract component, suggest, AI actions",
    areas: ["app", "exploration"],
    files: 17,
    sites: [
      {
        file: "chrome/ComponentsSection.tsx",
        line: 114,
        code: "<Sparkles /> Extract component",
        area: "app"
      },
      {
        file: "chrome/LayerPanel.tsx",
        line: 613,
        code: "<Sparkles /> Make component",
        area: "app"
      },
      {
        file: "collaboration/annotations/KindBar.tsx",
        line: 49,
        code: "<Sparkles /> Suggest",
        area: "app"
      },
      {
        file: "explorations/collaboration/a11y.tsx",
        line: 288,
        code: '<Sparkles /> Ask Claude Code to fix {count("differs")} differences',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 140,
        code: 'agent: { verb: "finished what you asked", icon: Sparkles, color: "oklch(0.7 0.16 300)" },',
        area: "exploration"
      },
      {
        file: "explorations/collaboration/notifications.tsx",
        line: 221,
        code: '{ id: "agents", title: "Agents", icon: Sparkles, matches: (notice) => notice.kind === "agent" }',
        area: "exploration"
      },
      {
        file: "explorations/parts.tsx",
        line: 166,
        code: "{person.agent ? <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} /> : initials(person)}",
        area: "exploration"
      },
      {
        file: "explorations/portal/admin.tsx",
        line: 410,
        code: '<Sparkles className="size-6" />',
        area: "exploration"
      }
    ],
    moreSites: 15,
    fluent: {
      name: "Sparkle",
      file: "sparkle",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SparkleCircle",
        file: "sparkle-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SparkleAction",
        file: "sparkle-action",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Wand",
        file: "wand",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "BotSparkle",
        file: "bot-sparkle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Square",
    lucideKey: "Square",
    context: "Stop button, window maximize",
    areas: ["app", "exploration", "story"],
    files: 5,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 531,
        code: '<Square className="fill-current" />',
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 100,
        code: "{[Minus, Square, X].map((Icon, index) => (",
        area: "exploration"
      },
      {
        file: "explorations/parts.tsx",
        line: 139,
        code: "{[Minus, Square, X].map((Glyph, index) => (",
        area: "exploration"
      },
      {
        file: "library/FilterControls.tsx",
        line: 37,
        code: "return <Square />",
        area: "app"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 28,
        code: '{ name: "Revenue", icon: Square, depth: 2, selectedBy: [mia], selected: true },',
        area: "story"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 29,
        code: '{ name: "Active users", icon: Square, depth: 2 },',
        area: "story"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 30,
        code: '{ name: "Churn", icon: Square, depth: 2, selectedBy: [jonas, priya] },',
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Square",
      file: "square",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Stop",
        file: "stop",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "RecordStop",
        file: "record-stop",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Maximize",
        file: "maximize",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "SquareShadow",
        file: "square-shadow",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareArrowOutDownLeft",
    lucideKey: "SquareArrowOutDownLeft",
    context: "Move back to main window",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "lenses/GroupActions.tsx",
        line: 28,
        code: "<SquareArrowOutDownLeft />",
        area: "app"
      },
      {
        file: "lenses/LensBar.tsx",
        line: 164,
        code: "<SquareArrowOutDownLeft /> Move to main window",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PictureInPictureExit",
      file: "picture-in-picture-exit",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "WindowArrowUp",
        file: "window-arrow-up",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMinimize",
        file: "arrow-minimize",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ArrowImport",
        file: "arrow-import",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowEnterLeft",
        file: "arrow-enter-left",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareArrowOutUpRight",
    lucideKey: "SquareArrowOutUpRight",
    context: "Move to new window, create issue",
    areas: ["exploration", "app"],
    files: 5,
    sites: [
      {
        file: "explorations/code-panel/CodePanel.tsx",
        line: 195,
        code: "<SquareArrowOutUpRight />",
        area: "exploration"
      },
      {
        file: "explorations/code-panel/CodePanel.tsx",
        line: 301,
        code: "<SquareArrowOutUpRight />",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 901,
        code: "<SquareArrowOutUpRight /> Create issue",
        area: "exploration"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 345,
        code: '<SquareArrowOutUpRight /> {lens ? `Move ${lens.name} to new window` : "Move to new window"}',
        area: "exploration"
      },
      {
        file: "lenses/GroupActions.tsx",
        line: 34,
        code: "<SquareArrowOutUpRight />",
        area: "app"
      },
      {
        file: "lenses/LensBar.tsx",
        line: 169,
        code: "<SquareArrowOutUpRight /> Move to new window",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "WindowNew",
      file: "window-new",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Open",
        file: "open",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PictureInPictureEnter",
        file: "picture-in-picture-enter",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowUpRight",
        file: "arrow-up-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LinkSquare",
        file: "link-square",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareCheck",
    lucideKey: "SquareCheck",
    context: "Checkbox element kind",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 42,
        code: '"square-check": SquareCheck,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CheckboxChecked",
      file: "checkbox-checked",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CheckmarkSquare",
        file: "checkmark-square",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CheckboxUnchecked",
        file: "checkbox-unchecked",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CheckboxIndeterminate",
        file: "checkbox-indeterminate",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Checkmark",
        file: "checkmark",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareCode",
    lucideKey: "SquareCode",
    context: "Code element kind",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 55,
        code: '"square-code": SquareCode,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CodeBlock",
      file: "code-block",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Code",
        file: "code",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "CodeText",
        file: "code-text",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "DocumentCode",
        file: "document-code",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "WindowDevTools",
        file: "window-dev-tools",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareDashed",
    lucideKey: "SquareDashed",
    context: "Empty slot, needs props, unset frame",
    areas: ["app"],
    files: 7,
    sites: [
      {
        file: "canvas/CanvasOverlay.tsx",
        line: 408,
        code: '<SquareDashed className="size-2.5" />',
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 226,
        code: "return <SquareDashed {...props} />",
        area: "app"
      },
      {
        file: "chrome/ComponentCard.tsx",
        line: 228,
        code: '"needs-props": SquareDashed,',
        area: "app"
      },
      {
        file: "chrome/instance-slots.tsx",
        line: 341,
        code: '<SquareDashed className="size-4 shrink-0" style={{ color: slotColor }} />',
        area: "app"
      },
      {
        file: "chrome/ModesPanel.tsx",
        line: 114,
        code: '<SquareDashed className="text-muted-foreground" />',
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 49,
        code: "slot: SquareDashed",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 378,
        code: "<SquareDashed /> Make slot",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 393,
        code: "<SquareDashed style={{ color: slotColor }} /> Make slot",
        area: "app"
      }
    ],
    moreSites: 3,
    fluent: {
      name: "SquareHint",
      file: "square-hint",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SelectObject",
        file: "select-object",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BorderNone",
        file: "border-none",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Square",
        file: "square",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SquareHintSparkles",
        file: "square-hint-sparkles",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareMousePointer",
    lucideKey: "SquareMousePointer",
    context: "Select element kind and tool",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 40,
        code: '"square-mouse-pointer": SquareMousePointer,',
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/tool-details.ts",
        line: 10,
        code: "interact: SquareMousePointer",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "CursorHover",
      file: "cursor-hover",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SelectObject",
        file: "select-object",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Cursor",
        file: "cursor",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "CursorClick",
        file: "cursor-click",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SquareHint",
        file: "square-hint",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquarePlus",
    lucideKey: "SquarePlus",
    context: "Insert",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 92,
        code: "insert: SquarePlus,",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/FloatingToolbar.tsx",
        line: 36,
        code: "<SquarePlus />",
        area: "app"
      },
      {
        file: "lenses/LensBar.tsx",
        line: 156,
        code: "<SquarePlus /> Open in new tab",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "AddSquare",
      file: "add-square",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Add",
        file: "add",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SquareAdd",
        file: "square-add",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "AddSquareMultiple",
        file: "add-square-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "AddCircle",
        file: "add-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "SquaresExclude",
    lucideKey: "SquaresExclude",
    context: "Select inverse",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 86,
        code: "selectInverse: SquaresExclude,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ShapeExclude",
      file: "shape-exclude",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SelectAllOff",
        file: "select-all-off",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShapeSubtract",
        file: "shape-subtract",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShapeIntersect",
        file: "shape-intersect",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SelectObject",
        file: "select-object",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareStack",
    lucideKey: "SquareStack",
    context: "Select matching",
    areas: ["app", "exploration"],
    files: 3,
    sites: [
      {
        file: "canvas/BoardMenus.tsx",
        line: 42,
        code: 'icon={<SquareStack aria-hidden className="size-3.5" />}',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 85,
        code: "selectMatching: SquareStack,",
        area: "app"
      },
      {
        file: "explorations/canvas-container/canvas-sketch.tsx",
        line: 1022,
        code: "icon={SquareStack}",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SquareMultiple",
      file: "square-multiple",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Stack",
        file: "stack",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SelectAllOn",
        file: "select-all-on",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "LayerDiagonal",
        file: "layer-diagonal",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CopySelect",
        file: "copy-select",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SquareTerminal",
    lucideKey: "SquareTerminal",
    context: "Console panel",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 275,
        code: "icon={SquareTerminal}",
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 145,
        code: "<SquareTerminal />",
        area: "app"
      },
      {
        file: "chrome/StatusBar.tsx",
        line: 211,
        code: 'icon={<SquareTerminal className="size-3.5" />}',
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 367,
        code: '<SquareTerminal /> Console <MenubarShortcut>{shortcutOf("console")}</MenubarShortcut>',
        area: "exploration"
      },
      {
        file: "packages/presence-ui/src/AgentPointer.tsx",
        line: 100,
        code: "console: SquareTerminal,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "WindowConsole",
      file: "window-console",
      sizes: [20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Code",
        file: "code",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "CodeBlock",
        file: "code-block",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "WindowDevTools",
        file: "window-dev-tools",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CodeText",
        file: "code-text",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Squircle",
    lucideKey: "Squircle",
    context: "Squircle corner option",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/controls.tsx",
        line: 786,
        code: '{ value: "squircle", label: "Squircle" },',
        area: "app"
      },
      {
        file: "inspector/controls/controls.tsx",
        line: 794,
        code: "* Corner shape, from its button in Radius's name row (PAR-652's Appearance): Round, as every browser draws, or Squircle, Bevel,",
        area: "app"
      },
      {
        file: "inspector/controls/controls.tsx",
        line: 820,
        code: "<Squircle />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Square",
      file: "square",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Circle",
        file: "circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Oval",
        file: "oval",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SquareShadow",
        file: "square-shadow",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Shapes",
        file: "shapes",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Star",
    lucideKey: "Star",
    context: "Starred, favorite",
    areas: ["exploration", "app"],
    files: 5,
    sites: [
      {
        file: "explorations/portal/parts.tsx",
        line: 162,
        code: '<NavItem icon={<Star className="size-4" />} label="Starred" count={3} active={active === "starred"} />',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 711,
        code: '<Star /> {starred ? "Unstar" : "Star"}',
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 1051,
        code: 'starred: "Nothing starred yet. Star a project from its menu to keep it here.",',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 170,
        code: "<Star",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 472,
        code: '<Star className="size-5 fill-[oklch(0.86_0.17_88)] text-[oklch(0.86_0.17_88)]" /> 2,180',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 747,
        code: '<Star className="size-3.5 fill-current" /> {walker.rating}',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 852,
        code: '<Star className="size-3.5 fill-current" /> {walker.rating}',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-apps.tsx",
        line: 910,
        code: '<Star className="size-4 fill-current text-(--r-fg)" />',
        area: "exploration"
      }
    ],
    moreSites: 4,
    fluent: {
      name: "Star",
      file: "star",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "StarAdd",
        file: "star-add",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "StarEmphasis",
        file: "star-emphasis",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Bookmark",
        file: "bookmark",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "Heart",
        file: "heart",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "StepBack",
    lucideKey: "StepBack",
    context: "Previous design",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 88,
        code: "previousDesign: StepBack,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Previous",
      file: "previous",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowPrevious",
        file: "arrow-previous",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronLeft",
        file: "chevron-left",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowStepBack",
        file: "arrow-step-back",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleLeft",
        file: "chevron-double-left",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "StepForward",
    lucideKey: "StepForward",
    context: "Next design",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 87,
        code: "nextDesign: StepForward,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Next",
      file: "next",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowNext",
        file: "arrow-next",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ChevronRight",
        file: "chevron-right",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowStepOver",
        file: "arrow-step-over",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "ChevronDoubleRight",
        file: "chevron-double-right",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "StickyNote",
    lucideKey: "StickyNote",
    context: "Note layer",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/LayerTree.tsx",
        line: 1206,
        code: '<StickyNote className="size-3.5 shrink-0 text-muted-foreground" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Note",
      file: "note",
      sizes: [16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "NoteEdit",
        file: "note-edit",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "NotePin",
        file: "note-pin",
        sizes: [16, 20],
        unsized: true,
        color: false
      },
      {
        name: "Notepad",
        file: "notepad",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Sticker",
        file: "sticker",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Store",
    lucideKey: "Store",
    context: "Brand mark in sample data",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 515,
        code: 'look: { hue: 150, brand: "Acme", icon: Store, serif: true },',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "BuildingShop",
      file: "building-shop",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BuildingRetail",
        file: "building-retail",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Cart",
        file: "cart",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ShoppingBag",
        file: "shopping-bag",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Money",
        file: "money",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "StretchHorizontal",
    lucideKey: "StretchHorizontal",
    context: "Names view in Assets",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/AssetsPanel.tsx",
        line: 379,
        code: '{ view: "names", label: "Names", Icon: StretchHorizontal },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LayoutRowTwo",
      file: "layout-row-two",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "List",
        file: "list",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "ListBar",
        file: "list-bar",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: true
      },
      {
        name: "TextBulletList",
        file: "text-bullet-list",
        sizes: [16, 20, 24, 90],
        unsized: true,
        color: false
      },
      {
        name: "AppsList",
        file: "apps-list",
        sizes: [20, 24, 32],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Sun",
    lucideKey: "Sun",
    context: "Light theme",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/settings/definitions.ts",
        line: 123,
        code: '{ value: "light", label: "Light", icon: Sun },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "WeatherSunny",
      file: "weather-sunny",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "BrightnessHigh",
        file: "brightness-high",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "WeatherSunnyHigh",
        file: "weather-sunny-high",
        sizes: [20, 24, 48],
        unsized: true,
        color: false
      },
      {
        name: "Lightbulb",
        file: "lightbulb",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "WeatherPartlyCloudyDay",
        file: "weather-partly-cloudy-day",
        sizes: [16, 20, 24, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "SunMoon",
    lucideKey: "SunMoon",
    context: "Theme field",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "inspector/controls/field-parts.tsx",
        line: 909,
        code: '<SunMoon className="size-3.5" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "DarkTheme",
      file: "dark-theme",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "WeatherMoon",
        file: "weather-moon",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "WeatherSunny",
        file: "weather-sunny",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "CircleHalfFill",
        file: "circle-half-fill",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BrightnessHigh",
        file: "brightness-high",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Swords",
    lucideKey: "Swords",
    context: "Brand mark in sample data (Fluent has no swords)",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/data.ts",
        line: 261,
        code: 'look: { hue: 200, brand: "Arena", icon: Swords, dark: true },',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 563,
        code: "look: starter(200, Swords, true),",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Trophy",
      file: "trophy",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "Games",
        file: "games",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Shield",
        file: "shield",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Flash",
        file: "flash",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "Fire",
        file: "fire",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Table",
    lucideKey: "Table",
    context: "Table element kind",
    areas: ["app", "story"],
    files: 2,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 56,
        code: "table: Table,",
        area: "app"
      },
      {
        file: "multiplayer/LayersPanel.stories.tsx",
        line: 32,
        code: '{ name: "Table", icon: Table, depth: 1 }',
        area: "story"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Table",
      file: "table",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "TableSimple",
        file: "table-simple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Grid",
        file: "grid",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DocumentTable",
        file: "document-table",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TableMultiple",
        file: "table-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Table2",
    lucideKey: "Table2",
    context: "Table data kind, data lens",
    areas: ["exploration"],
    files: 3,
    sites: [
      {
        file: "explorations/lenses/data.ts",
        line: 198,
        code: 'table: { icon: Table2, color: tableColor, word: "Table" }',
        area: "exploration"
      },
      {
        file: "explorations/lenses/inspector.tsx",
        line: 64,
        code: '{ value: "design", label: info.inspector, icon: lens === "data" ? Table2 : SlidersHorizontal },',
        area: "exploration"
      },
      {
        file: "explorations/lenses/panel.tsx",
        line: 104,
        code: "const outlineIcons: Partial<Record<LensId, LucideIcon>> = { data: Table2, api: Server }",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TableSimple",
      file: "table-simple",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Table",
        file: "table",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Grid",
        file: "grid",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DocumentTable",
        file: "document-table",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Database",
        file: "database",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Tablet",
    lucideKey: "Tablet",
    context: "Tablet viewport",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/viewports.tsx",
        line: 27,
        code: "const deviceIcons = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor }",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Tablet",
      file: "tablet",
      sizes: [12, 16, 20, 24, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TabletSpeaker",
        file: "tablet-speaker",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PhoneTablet",
        file: "phone-tablet",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TabletLaptop",
        file: "tablet-laptop",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Phone",
        file: "phone",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Telescope",
    lucideKey: "Telescope",
    context: "Find references (Fluent has no telescope)",
    areas: ["app"],
    files: 3,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 93,
        code: "findReferences: Telescope,",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/FloatingToolbar.tsx",
        line: 39,
        code: "<Telescope />",
        area: "app"
      },
      {
        file: "chrome/ReferencePanel.tsx",
        line: 48,
        code: "icon={<Telescope className={headingIcon} />}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SearchSquare",
      file: "search-square",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DocumentSearch",
        file: "document-search",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "LinkMultiple",
        file: "link-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "Search",
        file: "search",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "BranchFork",
        file: "branch-fork",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Terminal",
    lucideKey: "Terminal",
    context: "Install the Parity CLI",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "chrome/AppMenu.tsx",
        line: 377,
        code: "<Terminal /> Install the Parity CLI…",
        area: "app"
      },
      {
        file: "explorations/lenses/chrome.tsx",
        line: 405,
        code: "<Terminal /> Install the Parity CLI…",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "WindowConsole",
      file: "window-console",
      sizes: [20],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Code",
        file: "code",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "CodeBlock",
        file: "code-block",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "WindowDevTools",
        file: "window-dev-tools",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CodeText",
        file: "code-text",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "TextCursor",
    lucideKey: "TextCursor",
    context: "Text cursor preview",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/token-previews.tsx",
        line: 156,
        code: '["text", TextCursor],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextT",
      file: "text-t",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextField",
        file: "text-field",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SlideTextCursor",
        file: "slide-text-cursor",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Textbox",
        file: "textbox",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Cursor",
        file: "cursor",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "TextCursorInput",
    lucideKey: "TextCursorInput",
    context: "Input element kind",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 41,
        code: '"text-cursor-input": TextCursorInput,',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "TextField",
      file: "text-field",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Textbox",
        file: "textbox",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "TextboxSettings",
        file: "textbox-settings",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Rename",
        file: "rename",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Form",
        file: "form",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "TextSelect",
    lucideKey: "SquareDashedText",
    context: "Select all",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 84,
        code: "selectAll: TextSelect,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SelectAllOn",
      file: "select-all-on",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SelectObject",
        file: "select-object",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "MultiselectLtr",
        file: "multiselect-ltr",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CopySelect",
        file: "copy-select",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SquareHint",
        file: "square-hint",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ThumbsUp",
    lucideKey: "ThumbsUp",
    context: "Votes in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 1084,
        code: '<ThumbsUp className="size-3.5" /> {card.votes}',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ThumbLike",
      file: "thumb-like",
      sizes: [16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Heart",
        file: "heart",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Star",
        file: "star",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "ThumbLikeDislike",
        file: "thumb-like-dislike",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CheckmarkCircle",
        file: "checkmark-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Timer",
    lucideKey: "Timer",
    context: "Time in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 1047,
        code: '<Timer className="size-4" /> 4:12',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Timer",
      file: "timer",
      sizes: [10, 12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Clock",
        file: "clock",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "Hourglass",
        file: "hourglass",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "HourglassHalf",
        file: "hourglass-half",
        sizes: [12, 16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ClockAlarm",
        file: "clock-alarm",
        sizes: [16, 20, 24, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "ToggleRight",
    lucideKey: "ToggleRight",
    context: "Boolean prop, switch kind",
    areas: ["app"],
    files: 4,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 44,
        code: '"toggle-right": ToggleRight,',
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 46,
        code: "boolean: ToggleRight,",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 105,
        code: '{ type: "boolean", label: "Toggle", icon: ToggleRight }',
        area: "app"
      },
      {
        file: "collaboration/annotations/annotation-options.ts",
        line: 86,
        code: "icon: ToggleRight,",
        area: "app"
      },
      {
        file: "inspector/controls/instance-section.tsx",
        line: 47,
        code: "boolean: ToggleRight,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ToggleRight",
      file: "toggle-right",
      sizes: [16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ToggleLeft",
        file: "toggle-left",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "ToggleMultiple",
        file: "toggle-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CheckboxChecked",
        file: "checkbox-checked",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "RadioButton",
        file: "radio-button",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Trash2",
    lucideKey: "Trash",
    context: "Delete",
    areas: ["app", "exploration"],
    files: 7,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 78,
        code: "delete: Trash2,",
        area: "app"
      },
      {
        file: "chrome/ModesPanel.tsx",
        line: 263,
        code: "<Trash2 /> Delete",
        area: "app"
      },
      {
        file: "chrome/MultiPanel.tsx",
        line: 109,
        code: "<Trash2 /> Delete",
        area: "app"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 314,
        code: "<Trash2 /> Delete",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 927,
        code: "<Trash2 /> Delete thread",
        area: "exploration"
      },
      {
        file: "inspector/sections/PropsSection.tsx",
        line: 822,
        code: "<Trash2 /> Remove",
        area: "app"
      },
      {
        file: "media/MediaCard.tsx",
        line: 73,
        code: "<Trash2 />",
        area: "app"
      },
      {
        file: "media/MediaWall.tsx",
        line: 260,
        code: "<Trash2 /> {removeLabel(image)}",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Delete",
      file: "delete",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DeleteDismiss",
        file: "delete-dismiss",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "BinRecycle",
        file: "bin-recycle",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "DeleteLines",
        file: "delete-lines",
        sizes: [20],
        unsized: true,
        color: false
      },
      {
        name: "Dismiss",
        file: "dismiss",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "TriangleAlert",
    lucideKey: "TriangleAlert",
    context: "Warnings, failures",
    areas: ["app", "story", "exploration"],
    files: 23,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 335,
        code: 'failed: { icon: <TriangleAlert />, color: "oklch(0.7 0.16 65)" },',
        area: "app"
      },
      {
        file: "canvas/ConsoleBadge.tsx",
        line: 44,
        code: '<TriangleAlert className={`size-3.5 text-amber-500 ${errors > 0 ? "ml-1" : ""}`} /> {warnings}',
        area: "app"
      },
      {
        file: "canvas/ContainerView.tsx",
        line: 1552,
        code: '<TriangleAlert aria-hidden className="size-3.5 shrink-0" />',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 46,
        code: 'serious: { label: "serious", icon: TriangleAlert, tone: "text-orange-600 dark:text-orange-400" },',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 205,
        code: '<TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />',
        area: "app"
      },
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 359,
        code: '<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 215,
        code: 'warning: <TriangleAlert className="text-amber-500" />,',
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 329,
        code: 'icon: <TriangleAlert className="size-3.5 text-amber-500" />,',
        area: "app"
      }
    ],
    moreSites: 26,
    fluent: {
      name: "Warning",
      file: "warning",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "ErrorCircle",
        file: "error-circle",
        sizes: [12, 16, 20, 24, 48],
        unsized: true,
        color: true
      },
      {
        name: "ShieldError",
        file: "shield-error",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "AlertUrgent",
        file: "alert-urgent",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "Important",
        file: "important",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Type",
    lucideKey: "Type",
    context: "Text kind and tool",
    areas: ["app", "exploration", "story"],
    files: 9,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 38,
        code: "type: Type,",
        area: "app"
      },
      {
        file: "canvas/kinds.tsx",
        line: 200,
        code: "return <Type {...props} />",
        area: "app"
      },
      {
        file: "chrome/FloatingToolbar/tool-details.ts",
        line: 9,
        code: "text: Type,",
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 87,
        code: "const basics: { id: string; label: string; icon: typeof Type; node: () => DesignNode }[] = [",
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 88,
        code: '{ id: "text", label: "Text", icon: Type, node: () => ({ type: "text", id: "text", text: "Text" }) },',
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 321,
        code: 'list.push({ type: "hint", key: "hint", text: `Type to search ${iconCount} icons too`, count: iconCount })',
        area: "app"
      },
      {
        file: "chrome/QuickInsert.tsx",
        line: 577,
        code: "const Icon = basics.find((basic) => `basic:${basic.id}` === key)?.icon ?? Type",
        area: "app"
      },
      {
        file: "chrome/slot-props.tsx",
        line: 44,
        code: "text: Type,",
        area: "app"
      }
    ],
    moreSites: 6,
    fluent: {
      name: "TextT",
      file: "text-t",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Text",
        file: "text",
        sizes: [12, 16, 32],
        unsized: false,
        color: false
      },
      {
        name: "TextFont",
        file: "text-font",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextCaseTitle",
        file: "text-case-title",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "TextEditStyle",
        file: "text-edit-style",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Undo2",
    lucideKey: "Undo2",
    context: "Undo",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/AccessibilityPanel.tsx",
        line: 702,
        code: "<Undo2 /> Undo",
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 69,
        code: "undo: Undo2,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowUndo",
      file: "arrow-undo",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "ArrowCounterclockwise",
        file: "arrow-counterclockwise",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowReset",
        file: "arrow-reset",
        sizes: [20, 24, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowHookUpLeft",
        file: "arrow-hook-up-left",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "ArrowReply",
        file: "arrow-reply",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Ungroup",
    lucideKey: "Ungroup",
    context: "Unwrap",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 95,
        code: "unwrap: Ungroup,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "GroupDismiss",
      file: "group-dismiss",
      sizes: [20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "GroupReturn",
        file: "group-return",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SquareMultiple",
        file: "square-multiple",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowSplit",
        file: "arrow-split",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SelectAllOff",
        file: "select-all-off",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Unlink",
    lucideKey: "Unlink",
    context: "Detach instance, unlink",
    areas: ["app", "exploration"],
    files: 5,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 98,
        code: "detach: Unlink,",
        area: "app"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 783,
        code: "icon: Unlink,",
        area: "exploration"
      },
      {
        file: "explorations/collaboration/comments.tsx",
        line: 896,
        code: "<Unlink /> Unlink {issue}",
        area: "exploration"
      },
      {
        file: "inspector/controls/field-parts.tsx",
        line: 1521,
        code: '<Unlink aria-hidden className="size-3.5 text-muted-foreground" />',
        area: "app"
      },
      {
        file: "inspector/controls/field-parts.tsx",
        line: 2800,
        code: '<Unlink className="size-3.5" />',
        area: "app"
      },
      {
        file: "inspector/controls/instance-section.tsx",
        line: 353,
        code: "<Unlink /> Detach",
        area: "app"
      },
      {
        file: "inspector/controls/keyword-sets.tsx",
        line: 505,
        code: '<Unlink aria-hidden className="size-3.5 text-muted-foreground" />',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "LinkDismiss",
      file: "link-dismiss",
      sizes: [16, 20, 24],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "LinkOff",
        file: "link-off",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "DiamondDismiss",
        file: "diamond-dismiss",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "LinkMultiple",
        file: "link-multiple",
        sizes: [16, 20, 24],
        unsized: true,
        color: true
      },
      {
        name: "Dismiss",
        file: "dismiss",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Upload",
    lucideKey: "Upload",
    context: "Upload element kind",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "canvas/element-kinds.tsx",
        line: 49,
        code: "upload: Upload,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ArrowUpload",
      file: "arrow-upload",
      sizes: [16, 20, 24, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CloudArrowUp",
        file: "cloud-arrow-up",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "ArrowExportUp",
        file: "arrow-export-up",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "DocumentArrowUp",
        file: "document-arrow-up",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Share",
        file: "share",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "User",
    lucideKey: "User",
    context: "Profile in sample app",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/renders-apps.tsx",
        line: 867,
        code: '{ label: "Profile", icon: User }',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Person",
      file: "person",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PersonCircle",
        file: "person-circle",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "PersonAccount",
        file: "person-account",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "ContactCard",
        file: "contact-card",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "PersonSquare",
        file: "person-square",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "UserPlus",
    lucideKey: "UserPlus",
    context: "Invite",
    areas: ["exploration"],
    files: 7,
    sites: [
      {
        file: "explorations/portal/admin.tsx",
        line: 302,
        code: "<UserPlus /> Invite",
        area: "exploration"
      },
      {
        file: "explorations/portal/foryou.tsx",
        line: 23,
        code: "invite: UserPlus",
        area: "exploration"
      },
      {
        file: "explorations/portal/parts.tsx",
        line: 170,
        code: '<NavItem icon={<UserPlus className="size-4" />} label="Invite teammates" />',
        area: "exploration"
      },
      {
        file: "explorations/portal/Portal.stories.tsx",
        line: 76,
        code: "<UserPlus /> Invite",
        area: "exploration"
      },
      {
        file: "explorations/start/page.tsx",
        line: 1291,
        code: "<UserPlus /> Invite people",
        area: "exploration"
      },
      {
        file: "explorations/start/search.tsx",
        line: 40,
        code: '{ label: "Invite people to Kestrel", icon: UserPlus },',
        area: "exploration"
      },
      {
        file: "explorations/start-page-parts.tsx",
        line: 163,
        code: "invite: UserPlus",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "PersonAdd",
      file: "person-add",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PeopleAdd",
        file: "people-add",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "PersonSquareAdd",
        file: "person-square-add",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "PersonArrowRight",
        file: "person-arrow-right",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "MailAdd",
        file: "mail-add",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "UserRound",
    lucideKey: "UserRound",
    context: "Avatar fallback",
    areas: ["app", "exploration"],
    files: 2,
    sites: [
      {
        file: "account/PersonAvatar.tsx",
        line: 72,
        code: "<UserRound style={{ width: size * 0.58, height: size * 0.58 }} />",
        area: "app"
      },
      {
        file: "explorations/start/page.tsx",
        line: 372,
        code: "<UserRound style={{ width: size * 0.58, height: size * 0.58 }} />",
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Person",
      file: "person",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PersonCircle",
        file: "person-circle",
        sizes: [12, 16, 20, 24, 28, 32],
        unsized: true,
        color: false
      },
      {
        name: "PersonAccount",
        file: "person-account",
        sizes: [16],
        unsized: false,
        color: false
      },
      {
        name: "PersonSquare",
        file: "person-square",
        sizes: [16, 20, 24, 32],
        unsized: true,
        color: false
      },
      {
        name: "Guest",
        file: "guest",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      }
    ]
  },
  {
    lucide: "Users",
    lucideKey: "Users",
    context: "Shared with you, people",
    areas: ["exploration", "app"],
    files: 5,
    sites: [
      {
        file: "explorations/portal/parts.tsx",
        line: 163,
        code: '<NavItem icon={<Users className="size-4" />} label="Shared with you" count={2} active={active === "shared"} />',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 233,
        code: 'look: { hue: 205, brand: "Standup", icon: Users, org: "Kestrel" },',
        area: "exploration"
      },
      {
        file: "explorations/start/data.ts",
        line: 527,
        code: "look: starter(205, Users),",
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 360,
        code: '{ label: "Members", icon: Users },',
        area: "exploration"
      },
      {
        file: "explorations/start/renders-web.tsx",
        line: 1069,
        code: "{[Users, LibraryBig, Settings].map((Icon, index) => (",
        area: "exploration"
      },
      {
        file: "explorations/start/search.tsx",
        line: 42,
        code: '{ label: "Switch organization", icon: Users },',
        area: "exploration"
      },
      {
        file: "start/ProjectList.tsx",
        line: 28,
        code: "icon: Users,",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "People",
      file: "people",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: true
    },
    alternatives: [
      {
        name: "PeopleTeam",
        file: "people-team",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "PeopleCommunity",
        file: "people-community",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "PeopleList",
        file: "people-list",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: true
      },
      {
        name: "PeopleAudience",
        file: "people-audience",
        sizes: [20, 24, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Volume1",
    lucideKey: "Volume1",
    context: "Low volume",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "packages/media-player/src/VideoPlayer.tsx",
        line: 337,
        code: "return volume < 0.5 ? <Volume1 /> : <Volume2 />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Speaker1",
      file: "speaker",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Speaker0",
        file: "speaker",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Speaker2",
        file: "speaker",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SpeakerEdit",
        file: "speaker-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SoundWaveCircle",
        file: "sound-wave-circle",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Volume2",
    lucideKey: "Volume2",
    context: "High volume",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "packages/media-player/src/VideoPlayer.tsx",
        line: 337,
        code: "return volume < 0.5 ? <Volume1 /> : <Volume2 />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Speaker2",
      file: "speaker",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Speaker1",
        file: "speaker",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SpeakerEdit",
        file: "speaker-edit",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "SoundSource",
        file: "sound-source",
        sizes: [20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "HeadphonesSoundWave",
        file: "headphones-sound-wave",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "VolumeX",
    lucideKey: "VolumeX",
    context: "Muted",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "packages/media-player/src/VideoPlayer.tsx",
        line: 334,
        code: "return <VolumeX />",
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "SpeakerMute",
      file: "speaker-mute",
      sizes: [16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "SpeakerOff",
        file: "speaker-off",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "Speaker0",
        file: "speaker",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "AlertOff",
        file: "alert-off",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "Prohibited",
        file: "prohibited",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "WandSparkles",
    lucideKey: "WandSparkles",
    context: "Format process",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 65,
        code: 'format: { icon: WandSparkles, tint: "var(--canvas-component)", role: "Formats files" },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Wand",
      file: "wand",
      sizes: [16, 20, 24, 28, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "TextGrammarWand",
        file: "text-grammar-wand",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Sparkle",
        file: "sparkle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PaintBrushSparkle",
        file: "paint-brush-sparkle",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "BroomSparkle",
        file: "broom-sparkle",
        sizes: [16, 20],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Wifi",
    lucideKey: "Wifi",
    context: "Device status bar mock",
    areas: ["exploration"],
    files: 1,
    sites: [
      {
        file: "explorations/start/render-kit.tsx",
        line: 189,
        code: '<Wifi className="size-4" strokeWidth={2.5} />',
        area: "exploration"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Wifi1",
      file: "wifi",
      sizes: [20, 24, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Wifi2",
        file: "wifi",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Wifi3",
        file: "wifi",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Wifi4",
        file: "wifi",
        sizes: [20, 24],
        unsized: true,
        color: false
      },
      {
        name: "CellularData1",
        file: "cellular-data",
        sizes: [20, 24],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "WifiOff",
    lucideKey: "WifiOff",
    context: "Offline note",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "packages/presence-ui/src/ConnectionNote.tsx",
        line: 24,
        code: 'lead={<WifiOff className="size-4 text-amber-600 dark:text-amber-400" />}',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "WifiOff",
      file: "wifi-off",
      sizes: [20, 24, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "CloudOff",
        file: "cloud-off",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "PlugDisconnected",
        file: "plug-disconnected",
        sizes: [16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "WifiWarning",
        file: "wifi-warning",
        sizes: [20, 24],
        unsized: true,
        color: true
      },
      {
        name: "GlobeOff",
        file: "globe-off",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "X",
    lucideKey: "X",
    context: "Close, dismiss, clear",
    areas: ["app", "exploration", "story"],
    files: 36,
    sites: [
      {
        file: "account/SignInPanels.tsx",
        line: 334,
        code: 'canceled: { icon: <X />, color: "oklch(0.55 0 0)" },',
        area: "app"
      },
      {
        file: "chrome/command-icons.ts",
        line: 126,
        code: "closeTab: X,",
        area: "app"
      },
      {
        file: "chrome/ConsolePanel.tsx",
        line: 183,
        code: "<X />",
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 81,
        code: '<X className="size-3.5" /> Couldn&apos;t copy',
        area: "app"
      },
      {
        file: "chrome/Copy.tsx",
        line: 146,
        code: "<X",
        area: "app"
      },
      {
        file: "chrome/ErrorBoundary.tsx",
        line: 305,
        code: "<X />",
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 115,
        code: "<X />",
        area: "app"
      },
      {
        file: "chrome/ExtensionLog.tsx",
        line: 154,
        code: "<X />",
        area: "app"
      }
    ],
    moreSites: 42,
    fluent: {
      name: "Dismiss",
      file: "dismiss",
      sizes: [12, 16, 20, 24, 28, 32, 48],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "DismissCircle",
        file: "dismiss-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: true
      },
      {
        name: "DismissSquare",
        file: "dismiss-square",
        sizes: [20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "Delete",
        file: "delete",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SubtractCircle",
        file: "subtract-circle",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "Zap",
    lucideKey: "Zap",
    context: "Builder process",
    areas: ["app"],
    files: 1,
    sites: [
      {
        file: "chrome/Processes.tsx",
        line: 60,
        code: 'builder: { icon: Zap, tint: "var(--canvas-screen)", role: "Renders the canvas" },',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "Flash",
      file: "flash",
      sizes: [12, 16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "FlashFlow",
        file: "flash-flow",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "FlashCheckmark",
        file: "flash-checkmark",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "FlashSparkle",
        file: "flash-sparkle",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "Rocket",
        file: "rocket",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ZoomIn",
    lucideKey: "ZoomIn",
    context: "Zoom in",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 115,
        code: "zoomIn: ZoomIn,",
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 164,
        code: '["zoom-in", ZoomIn],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ZoomIn",
      file: "zoom-in",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Add",
        file: "add",
        sizes: [12, 16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "SearchSquare",
        file: "search-square",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMaximize",
        file: "arrow-maximize",
        sizes: [16, 20, 24, 28, 32, 48],
        unsized: true,
        color: false
      },
      {
        name: "FullScreenMaximize",
        file: "full-screen-maximize",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  },
  {
    lucide: "ZoomOut",
    lucideKey: "ZoomOut",
    context: "Zoom out",
    areas: ["app"],
    files: 2,
    sites: [
      {
        file: "chrome/command-icons.ts",
        line: 116,
        code: "zoomOut: ZoomOut,",
        area: "app"
      },
      {
        file: "chrome/token-previews.tsx",
        line: 165,
        code: '["zoom-out", ZoomOut],',
        area: "app"
      }
    ],
    moreSites: 0,
    fluent: {
      name: "ZoomOut",
      file: "zoom-out",
      sizes: [16, 20, 24, 28, 32],
      unsized: true,
      color: false
    },
    alternatives: [
      {
        name: "Subtract",
        file: "subtract",
        sizes: [12, 16, 20, 24, 28, 48],
        unsized: true,
        color: false
      },
      {
        name: "SearchSquare",
        file: "search-square",
        sizes: [16, 20, 24],
        unsized: true,
        color: false
      },
      {
        name: "ArrowMinimize",
        file: "arrow-minimize",
        sizes: [16, 20, 24, 28],
        unsized: true,
        color: false
      },
      {
        name: "FullScreenMinimize",
        file: "full-screen-minimize",
        sizes: [16, 20, 24, 28, 32],
        unsized: true,
        color: false
      }
    ]
  }
]
