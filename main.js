const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
    enableAdmonitions: true,
    enableCenterImages: true,
    enableCenterTable: true,
    enableEmbeds: true,
    enableHighlight: true,
    enableTableStyle: true,
    enableUnderline: true,
    useCustomColor: false,
    customColor: '#529b2e'
};

class GateStudyStylesPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // Add the settings tab
        this.addSettingTab(new GateStudySettingTab(this.app, this));

        // Apply styles on load
        this.applyAllStyles();
    }

    onunload() {
        // Clean up body classes and CSS variables when disabled
        this.removeAllStyles();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.applyAllStyles();
    }

    applyAllStyles() {
        // Toggle specific body classes based on settings
        this.toggleStyle('gs-admonitions', this.settings.enableAdmonitions);
        this.toggleStyle('gs-center-images', this.settings.enableCenterImages);
        this.toggleStyle('gs-center-table', this.settings.enableCenterTable);
        this.toggleStyle('gs-embeds', this.settings.enableEmbeds);
        this.toggleStyle('gs-highlight', this.settings.enableHighlight);
        this.toggleStyle('gs-table', this.settings.enableTableStyle);
        this.toggleStyle('gs-underline', this.settings.enableUnderline);

        // Apply custom color or fallback to default accent
        if (this.settings.useCustomColor) {
            document.body.style.setProperty('--gate-custom-color', this.settings.customColor);
        } else {
            document.body.style.setProperty('--gate-custom-color', 'var(--color-accent)');
        }
    }

    toggleStyle(className, enable) {
        if (enable) {
            document.body.classList.add(className);
        } else {
            document.body.classList.remove(className);
        }
    }

    removeAllStyles() {
        const classes = [
            'gs-admonitions', 
            'gs-center-images', 
            'gs-center-table', 
            'gs-embeds', 
            'gs-highlight', 
            'gs-table', 
            'gs-underline'
        ];
        classes.forEach(c => document.body.classList.remove(c));
        
        // Remove the injected custom color variable
        document.body.style.removeProperty('--gate-custom-color');
    }
}

class GateStudySettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'GATE Study Styles Settings' });

        // --- Custom Color Settings ---
        containerEl.createEl('h3', { text: 'Color Settings' });

        new Setting(containerEl)
            .setName('Use Custom Accent Color')
            .setDesc('Override the default Obsidian accent color for highlights, tables, embeds, and underlines.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCustomColor)
                .onChange(async (value) => {
                    this.plugin.settings.useCustomColor = value;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render settings tab to show/hide color picker
                }));

        // Only show color picker if the custom color toggle is enabled
        if (this.plugin.settings.useCustomColor) {
            new Setting(containerEl)
                .setName('Pick Custom Color')
                .setDesc('Choose the color to be applied to your custom styles.')
                .addColorPicker(color => color
                    .setValue(this.plugin.settings.customColor)
                    .onChange(async (value) => {
                        this.plugin.settings.customColor = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // --- Layout & Feature Settings ---
        containerEl.createEl('h3', { text: 'Style Modules' });

        new Setting(containerEl)
            .setName('GATE Study Callouts')
            .setDesc('Enable custom callouts (subject, topic, formula, pyq, etc.)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAdmonitions)
                .onChange(async (value) => {
                    this.plugin.settings.enableAdmonitions = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Center Images')
            .setDesc('Automatically align all images to the center.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableCenterImages)
                .onChange(async (value) => {
                    this.plugin.settings.enableCenterImages = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Center Tables')
            .setDesc('Automatically align all markdown tables to the center.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableCenterTable)
                .onChange(async (value) => {
                    this.plugin.settings.enableCenterTable = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Clean Embeds')
            .setDesc('Remove backgrounds, borders, and margins from embedded notes.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableEmbeds)
                .onChange(async (value) => {
                    this.plugin.settings.enableEmbeds = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Highlight Styling')
            .setDesc('Enable custom background color and styling for <mark> and ==text== highlights.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableHighlight = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Table Header Styling')
            .setDesc('Enable custom background and text color for table headers.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTableStyle)
                .onChange(async (value) => {
                    this.plugin.settings.enableTableStyle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Underline Styling')
            .setDesc('Enable custom styling for <u>text</u> elements.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableUnderline)
                .onChange(async (value) => {
                    this.plugin.settings.enableUnderline = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = GateStudyStylesPlugin;
