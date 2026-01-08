# 🚀 Installation & Onboarding Experience

## Discord Installation Limitations

**Can you configure the bot during Discord OAuth2 installation?**
❌ **No.** Discord's OAuth2 flow only allows:
- Selecting which server to add the bot to
- Granting permissions
- Adding scopes

Discord does **not** support custom configuration forms during installation.

---

## ✅ Our Solution: Automatic Onboarding

Instead, we provide a **great post-installation experience**:

### 1. Automatic Welcome Message

When someone adds RaidPresence to their server, the bot automatically:

**Sends a setup guide to:**
- The server's **system channel** (where Discord announcements go)
- OR the **server owner via DM** (if no system channel)

**The message includes:**
- Welcome message explaining what the bot does
- Step-by-step setup instructions with command examples
- Configuration commands with exact syntax
- Tips for getting started

**Example:**
```
🎉 Thanks for adding RaidPresence!

Quick Setup Required:

1️⃣ Configure Raid Attendance Roles
Run: /config raid-roles roles:Raider,Member,Trial
Members with these roles will be automatically added to raid rosters.

2️⃣ Configure Raid Leader Roles
Run: /config leader-roles roles:Officer,Raid Leader
Members with these roles can create and manage raids.

3️⃣ Create Your First Raid
Run: /raid create date:2026-01-15 time:20:00 title:Heroic Raid Night

📋 Useful Commands
• /config view - View current settings
• /raid list - List upcoming raids
• /raid delete - Delete a raid
```

---

### 2. `/setup` Command

Server admins can run `/setup` anytime to see:
- Current configuration status
- Detailed setup instructions
- Tips for choosing role names
- Example commands
- Troubleshooting help

---

### 3. `/config view` Command

Quick way to check current settings:
```
/config view
```

Shows:
- Current raid attendance roles
- Current raid leader roles
- Configuration status

---

## 📋 Complete Installation Flow

### From User's Perspective:

1. **Click invite link** → Choose server
2. **Authorize permissions**
3. **Bot joins server**
4. **Immediate welcome message** appears in system channel or owner DM
5. **Admin runs config commands** following the guide
6. **Bot is ready to use!**

---

## 🎯 Invite Link Setup

### Your Bot Invite URL:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147502080&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your actual Discord Application Client ID.

### Required Permissions (Included in Link):

- ✅ Read Messages/View Channels
- ✅ Send Messages
- ✅ Embed Links
- ✅ Read Message History
- ✅ Use Slash Commands
- ✅ Manage Events (for permission checking)
- ✅ Read Server Members (for role scanning)

---

## 🌐 Alternative: Add Setup Landing Page

If you want an **even better experience**, create a simple landing page:

### Option A: GitHub Pages (Free)

Create `docs/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>RaidPresence - WoW Raid Management Bot</title>
</head>
<body>
  <h1>🎉 Add RaidPresence to Your Server!</h1>

  <h2>What is RaidPresence?</h2>
  <p>Reverse sign-up system for WoW raids. Everyone is auto-signed up, opt-out if you can't make it!</p>

  <h2>Quick Setup (2 minutes)</h2>
  <ol>
    <li><strong>Add the bot:</strong> <a href="YOUR_INVITE_LINK">Click here to add</a></li>
    <li><strong>Configure roles:</strong> Run <code>/config raid-roles roles:YourRoles</code></li>
    <li><strong>Set leaders:</strong> Run <code>/config leader-roles roles:YourLeaders</code></li>
    <li><strong>Create raid:</strong> Run <code>/raid create</code></li>
  </ol>

  <h2>Features</h2>
  <ul>
    <li>Automatic attendance tracking</li>
    <li>WoW class/spec selection</li>
    <li>Role composition display</li>
    <li>Multi-server support</li>
  </ul>

  <a href="YOUR_INVITE_LINK">
    <button>Add to Discord</button>
  </a>
</body>
</html>
```

Enable GitHub Pages in your repo settings → Host on `yourusername.github.io/RaidPresence`

### Option B: Custom Domain

Use your own domain with:
- Netlify (free hosting)
- Vercel (free hosting)
- Cloudflare Pages (free hosting)

---

## 📊 Installation Analytics (Future)

Want to track installations? Add these:

1. **Discord Developer Portal:**
   - Go to your app → OAuth2
   - See install count and analytics

2. **Database:**
   - Check `Guild` table count
   - Track `createdAt` timestamps
   - Monitor active servers

3. **Bot Lists:**
   - Submit to top.gg
   - Submit to discord.bots.gg
   - Get reviews and feedback

---

## 💡 Best Practices

### For Server Admins:

1. **Read the welcome message** - It has everything you need
2. **Use role IDs** - Right-click role → Copy ID (more reliable than names)
3. **Test first** - Create a test raid to verify setup
4. **Run `/setup`** - If you need help later

### For Bot Owner (You):

1. **Monitor welcome message logs** - Ensure they're being delivered
2. **Track common issues** - Add to `/setup` command
3. **Update documentation** - Based on user feedback
4. **Add Discord support server** - Help users directly

---

## 🔮 Future Enhancements

Possible improvements:

- **Interactive setup wizard** - Use Discord buttons/modals
- **Auto-detect roles** - Suggest common role names
- **Setup checklist** - Track completion with checkmarks
- **Video tutorial** - Screen recording of setup
- **Web dashboard** - Configure via website (monetization)

---

## ✅ Current Status

**Your bot now has:**
- ✅ Automatic welcome messages on server join
- ✅ `/setup` command for detailed help
- ✅ `/config` commands for easy configuration
- ✅ Multi-server ready with per-guild settings
- ✅ Professional onboarding experience

**No manual configuration needed during installation!**

---

Ready to deploy? Push these changes to Railway and test by re-inviting the bot to a test server!
