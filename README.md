# Chrome Vertical Tabs Manager

A powerful Chrome extension that provides vertical tab management with intuitive grouping features, making it easier to organize and navigate through multiple tabs.

## ✨ Features

### 🔍 **Vertical Tab Layout**
- Displays all tabs in a clean vertical sidebar
- Easy-to-read tab titles and favicons
- Compact, space-efficient design

### 📁 **Tab Grouping**
- Create custom tab groups with editable names
- Drag and drop tabs between groups
- Visual group organization with collapsible sections
- "Ungrouped" section for standalone tabs

### 🎛️ **Group Management**
- **Create Groups**: "New Group" button + right-click context menu
- **Rename Groups**: Double-click group names to edit
- **Reorder Groups**: Drag groups to rearrange or use up/down arrows
- **Delete Groups**: Remove groups and close all contained tabs at once
- **Collapse/Expand**: Minimize groups to save space

### 🔄 **Smart Tab Behavior**
- New tabs automatically join the current tab's group
- If current tab is ungrouped, new tabs remain ungrouped
- Tabs can be moved between groups via drag and drop
- Multi-select support (Ctrl/Cmd + click, Shift + click for ranges)

### 💾 **Session Management**
- **Auto-save**: Automatically saves your session state
- **Manual Save**: Save current session via popup
- **Session Restore**: Restore previous sessions after browser restart
- **Multiple Sessions**: Store up to 10 sessions (configurable)
- **Smart Detection**: Automatically creates new sessions on fresh browser starts

### 🎨 **Customization**
- **Themes**: Light and dark mode support
- **Sidebar Position**: Left or right side placement (requires browser restart)
- **Responsive Design**: Resizable sidebar width

### ⚡ **Performance**
- Runs entirely locally - no external servers
- Efficient memory usage with debounced updates
- Prevents duplicate tab rendering during rapid events

## 🚀 Installation

### From Chrome Web Store
*[Coming Soon]*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your toolbar

## 📖 How to Use

### Getting Started
1. **Open Sidebar**: Click the extension icon in the toolbar
2. **View Tabs**: All your current tabs appear in the vertical sidebar
3. **Switch Tabs**: Click any tab to activate it

### Working with Groups
1. **Create a Group**: 
   - Click "New Group" button, or
   - Right-click any tab → "Add to New Group"
2. **Rename Group**: Double-click the group name
3. **Move Tabs**: Drag tabs between groups
4. **Manage Groups**: Use the arrow buttons to reorder or X to delete

### Session Management
1. **Access Settings**: Click extension icon → popup opens
2. **Save Session**: Click "Save Current State"
3. **Restore Session**: Select from dropdown → "Restore Selected"
4. **Configure**: Adjust max sessions to store (1-10)

### Keyboard & Mouse Shortcuts
- **Single Click**: Activate tab
- **Ctrl/Cmd + Click**: Multi-select tabs
- **Shift + Click**: Select range of tabs
- **Drag & Drop**: Move tabs between groups
- **Right Click**: Context menu (on tabs)
- **Double Click**: Rename groups

## ⚙️ Configuration

### Theme Settings
- **Light Mode**: Default clean interface
- **Dark Mode**: Easy on the eyes for night usage

### Sidebar Position
- **Left Side**: Default position
- **Right Side**: Alternative layout (requires browser restart)

### Session Settings
- **Max Sessions**: Configure how many sessions to store (1-10)
- **Auto-save**: Automatically enabled with 1-second debounce

## 🔧 Technical Details

### Permissions Required
- `tabs`: Access and manage browser tabs
- `sidePanel`: Display the vertical sidebar
- `storage`: Save groups and session data

### Browser Compatibility
- Chrome Manifest V3
- Minimum Chrome version: 114+ (for sidePanel API)

### Data Storage
- **Session Storage**: Tab groups and window data (temporary)
- **Local Storage**: Saved sessions, themes, and settings (persistent)
- **No External Servers**: All data stays on your device

## 🐛 Known Limitations

- Groups and their names are not persistent by default (auto-save handles this)
- Sidebar position changes require browser restart
- Some Chrome internal pages (chrome://) cannot be restored in sessions
- Extension pages cannot be grouped or restored

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup
```bash
git clone panks/chrome-vertical-tabs
cd chrome-vertical-tabs
# Load unpacked in Chrome Developer Mode
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋‍♂️ Support

If you encounter any issues or have feature requests:
1. Check the [Issues](../../issues) page
2. Create a new issue with detailed description
3. Include Chrome version and extension version

## 🔄 Changelog

### Version 1.0
- Initial release
- Vertical tab layout
- Tab grouping and management
- Session save/restore
- Dark/light themes
- Drag and drop functionality

---

**Enjoy organized browsing with Vertical Tabs Manager!** 🎉
