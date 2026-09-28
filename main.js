const { Plugin, PluginSettingTab, Setting, debounce } = require('obsidian');

/* ==========================================================================
   Constants
========================================================================== */

const DEFAULT_SETTINGS = {
    // Style modules
    enableAdmonitions: true,
    enableCenterImages: true,
    enableCenterTable: true,
    enableEmbeds: true,
    enableHighlight: true,
    enableTableStyle: true,
    enableUnderline: true,

    // Accent color
    useCustomColor: false,
    customColor: '#df3522',

    // Adaptive dark mode images
    enableAdaptiveImages: true,
    invertPercentage: 100,
    preserveColors: true,
    brightness: 105,
    contrast: 105
};

// [min, max] for every numeric setting (used for validation and sliders)
const NUMBER_LIMITS = {
    invertPercentage: [0, 100],
    brightness: [50, 150],
    contrast: [50, 150]
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const ADAPTIVE_KEYS = [
    'enableAdaptiveImages',
    'invertPercentage',
    'preserveColors',
    'brightness',
    'contrast'
];

// Each module = one body class + one boolean setting
const STYLE_MODULES = [
    {
        id: 'callouts', cls: 'gs-admonitions', key: 'enableAdmonitions',
        name: 'GATE study callouts', short: 'GATE study callouts',
        desc: 'Custom callouts: subject, topic, formula, definition, concept, derivation, example, numerical, pyq, hint, answer, trick, examtip, important, mistake, memory, revision, faq, refer, related, navigation, prerequisite, next, table, and quick.'
    },
    {
        id: 'center-images', cls: 'gs-center-images', key: 'enableCenterImages',
        name: 'Center images', short: 'image centering',
        desc: 'Align all images to the center.'
    },
    {
        id: 'center-tables', cls: 'gs-center-table', key: 'enableCenterTable',
        name: 'Center tables', short: 'table centering',
        desc: 'Align all tables to the center.'
    },
    {
        id: 'clean-embeds', cls: 'gs-embeds', key: 'enableEmbeds',
        name: 'Clean embeds', short: 'clean embeds',
        desc: 'Remove backgrounds, borders, and margins from embedded notes.'
    },
    {
        id: 'highlights', cls: 'gs-highlight', key: 'enableHighlight',
        name: 'Highlight styling', short: 'highlight styling',
        desc: 'Custom background color and styling for <mark> and ==highlighted== text.'
    },
    {
        id: 'table-headers', cls: 'gs-table', key: 'enableTableStyle',
        name: 'Table header styling', short: 'table header styling',
        desc: 'Custom background and text color for table headers.'
    },
    {
        id: 'underline', cls: 'gs-underline', key: 'enableUnderline',
        name: 'Underline styling', short: 'underline styling',
        desc: 'Custom styling for <u>underlined</u> text.'
    }
];

const ADAPTIVE_MODULE = {
    id: 'adaptive-images', cls: 'gs-adaptive-images', key: 'enableAdaptiveImages',
    name: 'Invert images in dark mode', short: 'adaptive dark mode images',
    desc: 'Invert images so light-background diagrams blend into dark themes. Light mode is never touched.'
};

const ALL_MODULES = [...STYLE_MODULES, ADAPTIVE_MODULE];

const CUSTOM_COLOR_VAR = '--gate-custom-color';
const ADAPTIVE_FILTER_VAR = '--gs-adaptive-image-filter';

/* ==========================================================================
   Settings validation
========================================================================== */

// Accepts anything read from data.json and returns a complete, valid settings
// object. Unknown keys are dropped, wrong types fall back to defaults, and
// numbers are clamped to their allowed range.
function sanitizeSettings(raw) {
    const clean = Object.assign({}, DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return clean;

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const fallback = DEFAULT_SETTINGS[key];
        const value = raw[key];

        if (typeof fallback === 'boolean') {
            if (typeof value === 'boolean') clean[key] = value;
        } else if (typeof fallback === 'number') {
            if (typeof value === 'number' && Number.isFinite(value)) {
                const [min, max] = NUMBER_LIMITS[key];
                clean[key] = Math.min(max, Math.max(min, Math.round(value)));
            }
        } else if (key === 'customColor') {
            if (typeof value === 'string' && HEX_COLOR.test(value)) clean[key] = value;
        }
    }
    return clean;
}

/* ==========================================================================
   Plugin
========================================================================== */

class GateStudyStylesPlugin extends Plugin {
    async onload() {
        this.documents = new Set([document]);

        // Disk writes are debounced so dragging a slider doesn't hammer data.json.
        // Visual changes are still applied instantly.
        this.saveDebounced = debounce(() => this.persist(), 400, true);

        await this.loadSettings();

        this.addSettingTab(new GateStudySettingTab(this.app, this));
        this.registerCommands();

        // Style the main window immediately to avoid a flash of unstyled content
        this.applyToDocument(document);

        // Pop-out windows have their own document, so track them too
        this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, win) => {
            this.documents.add(win.document);
            this.applyToDocument(win.document);
        }));
        this.registerEvent(this.app.workspace.on('window-close', (_workspaceWindow, win) => {
            this.documents.delete(win.document);
        }));

        // Pick up pop-out windows that were already open before the plugin loaded
        this.app.workspace.onLayoutReady(() => {
            try {
                this.app.workspace.iterateAllLeaves(leaf => {
                    const doc = leaf.view && leaf.view.containerEl && leaf.view.containerEl.ownerDocument;
                    if (doc && !this.documents.has(doc)) {
                        this.documents.add(doc);
                        this.applyToDocument(doc);
                    }
                });
            } catch (error) {
                console.error('GATE Study Styles: could not scan pop-out windows', error);
            }
        });
    }

    onunload() {
        // Write any pending change, then remove everything we added
        this.saveDebounced.cancel();
        this.persist();
        for (const doc of this.documents) {
            this.removeFromDocument(doc);
        }
        this.documents.clear();
    }

    /* ---------- settings ---------- */

    async loadSettings() {
        let raw = null;
        try {
            raw = await this.loadData();
        } catch (error) {
            console.error('GATE Study Styles: failed to read settings, using defaults', error);
        }
        this.settings = sanitizeSettings(raw);
    }

    async persist() {
        try {
            await this.saveData(this.settings);
        } catch (error) {
            console.error('GATE Study Styles: failed to save settings', error);
        }
    }

    // Change one or more settings, apply them instantly, save shortly after
    updateSettings(patch) {
        this.settings = sanitizeSettings(Object.assign({}, this.settings, patch));
        this.applyAllStyles();
        this.saveDebounced();
    }

    resetSettings(keys) {
        const patch = {};
        for (const key of keys) patch[key] = DEFAULT_SETTINGS[key];
        this.updateSettings(patch);
    }

    /* ---------- commands ---------- */

    registerCommands() {
        for (const module of ALL_MODULES) {
            this.addCommand({
                id: `toggle-${module.id}`,
                name: `Toggle ${module.short}`,
                callback: () => this.updateSettings({ [module.key]: !this.settings[module.key] })
            });
        }
    }

    /* ---------- applying styles ---------- */

    applyAllStyles() {
        for (const doc of this.documents) {
            this.applyToDocument(doc);
        }
    }

    applyToDocument(doc) {
        const body = doc && doc.body;
        if (!body) return;

        const s = this.settings;

        for (const module of ALL_MODULES) {
            body.classList.toggle(module.cls, !!s[module.key]);
        }

        body.style.setProperty(
            CUSTOM_COLOR_VAR,
            s.useCustomColor ? s.customColor : 'var(--color-accent)'
        );

        // hue-rotate(180deg) keeps reds red and blues blue after inversion
        const hueRotate = s.preserveColors ? 'hue-rotate(180deg) ' : '';
        body.style.setProperty(
            ADAPTIVE_FILTER_VAR,
            `invert(${s.invertPercentage}%) ${hueRotate}brightness(${s.brightness}%) contrast(${s.contrast}%)`
        );
    }

    removeFromDocument(doc) {
        const body = doc && doc.body;
        if (!body) return;

        for (const module of ALL_MODULES) {
            body.classList.remove(module.cls);
        }
        body.style.removeProperty(CUSTOM_COLOR_VAR);
        body.style.removeProperty(ADAPTIVE_FILTER_VAR);
    }
}

/* ==========================================================================
   Settings tab
========================================================================== */

class GateStudySettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Re-render while keeping the scroll position
    redisplay() {
        const top = this.containerEl.scrollTop;
        this.display();
        this.containerEl.scrollTop = top;
    }

    addModuleToggle(containerEl, module, { rerender = false } = {}) {
        new Setting(containerEl)
            .setName(module.name)
            .setDesc(module.desc)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings[module.key])
                .onChange(value => {
                    this.plugin.updateSettings({ [module.key]: value });
                    if (rerender) this.redisplay();
                }));
    }

    addSlider(containerEl, name, desc, key) {
        const [min, max] = NUMBER_LIMITS[key];
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addSlider(slider => slider
                .setLimits(min, max, 1)
                .setValue(this.plugin.settings[key])
                .setDynamicTooltip()
                .setInstant(true)
                .onChange(value => this.plugin.updateSettings({ [key]: value })))
            .addExtraButton(button => button
                .setIcon('rotate-ccw')
                .setTooltip('Reset to default')
                .onClick(() => {
                    this.plugin.resetSettings([key]);
                    this.redisplay();
                }));
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        /* ---- Accent color ---- */
        new Setting(containerEl).setName('Accent color').setHeading();

        new Setting(containerEl)
            .setName('Use custom accent color')
            .setDesc('Override the Obsidian accent color for highlights, table headers, embeds, and underlines.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCustomColor)
                .onChange(value => {
                    this.plugin.updateSettings({ useCustomColor: value });
                    this.redisplay(); // show or hide the color picker
                }));

        if (this.plugin.settings.useCustomColor) {
            new Setting(containerEl)
                .setName('Custom color')
                .setDesc('The color used by the styles above.')
                .addColorPicker(picker => picker
                    .setValue(this.plugin.settings.customColor)
                    .onChange(value => this.plugin.updateSettings({ customColor: value })))
                .addExtraButton(button => button
                    .setIcon('rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        this.plugin.resetSettings(['customColor']);
                        this.redisplay();
                    }));
        }

        /* ---- Style modules ---- */
        new Setting(containerEl)
            .setName('Style modules')
            .setDesc('Each module can also be toggled from the command palette.')
            .setHeading();

        for (const module of STYLE_MODULES) {
            this.addModuleToggle(containerEl, module);
        }

        /* ---- Adaptive dark mode images ---- */
        new Setting(containerEl).setName('Adaptive dark mode images').setHeading();

        this.addModuleToggle(containerEl, ADAPTIVE_MODULE, { rerender: true });

        // Only show the fine-tuning controls while the feature is on
        if (this.plugin.settings.enableAdaptiveImages) {
            this.addSlider(containerEl, 'Invert amount',
                'How strongly images are inverted. 100% turns pure white into pure black.',
                'invertPercentage');

            new Setting(containerEl)
                .setName('Preserve original colors')
                .setDesc('Rotate hues after inverting so reds stay red and blues stay blue.')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.preserveColors)
                    .onChange(value => this.plugin.updateSettings({ preserveColors: value })));

            this.addSlider(containerEl, 'Brightness',
                'Brightness of inverted images (100% = unchanged).', 'brightness');
            this.addSlider(containerEl, 'Contrast',
                'Contrast of inverted images (100% = unchanged). Higher values make lines stand out.',
                'contrast');

            new Setting(containerEl)
                .setName('Reset adaptive image settings')
                .setDesc('Restore only the settings in this section to their defaults.')
                .addButton(button => button
                    .setButtonText('Reset')
                    .onClick(() => {
                        this.plugin.resetSettings(ADAPTIVE_KEYS);
                        this.redisplay();
                    }));
        }

        /* ---- Advanced ---- */
        new Setting(containerEl).setName('Advanced').setHeading();

        new Setting(containerEl)
            .setName('Reset all settings')
            .setDesc('Restore every GATE Study Styles setting to its default value.')
            .addButton(button => button
                .setButtonText('Reset to defaults')
                .setWarning()
                .onClick(() => {
                    this.plugin.resetSettings(Object.keys(DEFAULT_SETTINGS));
                    this.redisplay();
                }));
    }
}

module.exports = GateStudyStylesPlugin;
