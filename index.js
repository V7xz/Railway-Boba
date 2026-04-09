require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== TRACKING =====
const activityMap = new Map();

// ===== SHOP =====
const shopItems = [
  {
    name: "Roblox External",
    stock: 13,
    variants: [
      { label: "3 Days", price: 3 },
      { label: "7 Days", price: 7 },
      { label: "30 Days", price: 15 },
      { label: "Permanent", price: 18 }
    ]
  },
  { name: "Rust", price: 20, stock: 4 },
  { name: "Valorant", price: 10, stock: 8 }
];

// ===== PAYMENT (UNCHANGED) =====
const PAYMENT = {
  qrisImage: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
  paypalEmail: "your-paypal@email.com"
};

// ===== PERMISSION =====
const isAdmin = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  member.permissions.has(PermissionsBitField.Flags.ManageChannels);

// ===== COMMANDS (FIXED DASHBOARD) =====
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Open shop UI"),
  new SlashCommandBuilder().setName("stock").setDescription("View stock"),
  new SlashCommandBuilder().setName("dashboard").setDescription("Admin panel")
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Commands registered");
  } catch (err) {
    console.error(err);
  }
})();

// ===== READY =====
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // AUTO CLOSE (24h)
  setInterval(async () => {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.name.startsWith("order-") && !channel.name.startsWith("support-")) continue;

        const last = activityMap.get(channel.id) || now;

        if (now - last > 86400000) {
          try {
            await channel.setName("auto-closed-inactive");
            await channel.send("⛔ Auto-closed due to inactivity.");
            activityMap.delete(channel.id);
          } catch {}
        }
      }
    }
  }, 3600000);
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async (interaction) => {
  try {

    // ===== SLASH COMMANDS =====
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "help") {
        const embed = new EmbedBuilder()
          .setTitle("🛒 BOBA STORE")
          .setDescription("Shop system")
          .setColor("#2b2d31");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("open_shop").setLabel("🛒 Shop").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("ticket_btn").setLabel("🎫 Support").setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
      }

      if (interaction.commandName === "stock") {
        const embed = new EmbedBuilder().setTitle("📦 Stock").setColor("#2b2d31");

        shopItems.forEach(i => {
          embed.addFields({
            name: i.name,
            value: i.variants
              ? i.variants.map(v => `${v.label}: $${v.price}`).join("\n")
              : `$${i.price} | Stock: ${i.stock}`,
            inline: true
          });
        });

        return interaction.reply({ embeds: [embed] });
      }

      // ===== DASHBOARD FIXED =====
      if (interaction.commandName === "dashboard") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ Admin only", flags: 64 });

        const orders = interaction.guild.channels.cache.filter(c => c.name.startsWith("order-")).size;
        const tickets = interaction.guild.channels.cache.filter(c => c.name.startsWith("support-")).size;
        const closed = interaction.guild.channels.cache.filter(c => c.name.includes("closed") || c.name.includes("auto-closed")).size;

        const embed = new EmbedBuilder()
          .setTitle("📊 DASHBOARD")
          .addFields(
            { name: "Orders", value: `${orders}`, inline: true },
            { name: "Tickets", value: `${tickets}`, inline: true },
            { name: "Closed", value: `${closed}`, inline: true }
          )
          .setColor("Blue");

        return interaction.reply({ embeds: [embed], flags: 64 });
      }
    }

    // ===== BUTTONS =====
    if (interaction.isButton()) {

      activityMap.set(interaction.channel.id, Date.now());

      // OPEN SHOP
      if (interaction.customId === "open_shop") {
        const options = [];

        shopItems.forEach(i => {
          if (i.variants) {
            i.variants.forEach(v => {
              options.push({
                label: `${i.name} (${v.label})`,
                value: `${i.name}|${v.label}|${v.price}`
              });
            });
          } else {
            options.push({
              label: i.name,
              value: `${i.name}|default|${i.price}`
            });
          }
        });

        const menu = new StringSelectMenuBuilder()
          .setCustomId("select_item")
          .setPlaceholder("Select product")
          .addOptions(options);

        return interaction.reply({
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: 64
        });
      }

      // SUPPORT
      if (interaction.customId === "ticket_btn") {
        const ch = await interaction.guild.channels.create({
          name: `support-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        activityMap.set(ch.id, Date.now());

        const embed = new EmbedBuilder()
          .setTitle("🎫 Support Ticket")
          .setDescription("Wait for admin.")
          .setColor("Yellow");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("paid_btn").setLabel("✔ Paid").setStyle(ButtonStyle.Success)
        );

        await ch.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });

        return interaction.reply({ content: `Created ${ch}`, flags: 64 });
      }

      // PAID SYSTEM (UNCHANGED LOGIC)
      if (interaction.customId === "paid_btn") {
        await interaction.channel.setName(`pending-verification-${interaction.user.username}`);

        const verify = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("verify_payment").setLabel("✔ Verify").setStyle(ButtonStyle.Success)
        );

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ text: "Pending verification" });

        await interaction.message.edit({ embeds: [embed], components: [verify] });

        return interaction.reply({ content: "Sent for verification", flags: 64 });
      }

      if (interaction.customId === "verify_payment") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ Admin only", flags: 64 });

        await interaction.channel.setName(`paid-${interaction.user.username}`);

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ text: "Verified" });

        await interaction.message.edit({ embeds: [embed], components: [] });

        return interaction.reply({ content: "✔ Verified", flags: 64 });
      }
    }

    // ===== SELECT MENU =====
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "select_item") {

        const [name, variant, price] = interaction.values[0].split("|");

        const ch = await interaction.guild.channels.create({
          name: `order-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        activityMap.set(ch.id, Date.now());

        const embed = new EmbedBuilder()
          .setTitle("💳 Payment")
          .setDescription(`📦 ${name} (${variant})\n💰 $${price}`)
          .setImage(PAYMENT.qrisImage)
          .setColor("Yellow");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("paid_btn").setLabel("✔ Paid").setStyle(ButtonStyle.Success)
        );

        await ch.send({ embeds: [embed], components: [row] });

        return interaction.reply({ content: `Created ${ch}`, flags: 64 });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "❌ Error occurred", flags: 64 });
    }
  }
});

// ===== ACTIVITY TRACK =====
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.name.startsWith("order-") || msg.channel.name.startsWith("support-")) {
    activityMap.set(msg.channel.id, Date.now());
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN);
