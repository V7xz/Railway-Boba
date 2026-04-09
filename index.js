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

// ===== SHOP DATA (ADVANCED) =====
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

// ===== PAYMENT =====
const PAYMENT = {
  qrisImage: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
  paypalEmail: "your-paypal@email.com"
};

const pendingProofs = new Map();

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Show UI help"),
  new SlashCommandBuilder().setName("stock").setDescription("View shop")
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
})();

// ===== READY =====
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async (interaction) => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    // HELP UI
    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("🛒 BOBA.EXE STORE")
        .setDescription("Premium marketplace\nUse buttons below 👇")
        .setColor("#2b2d31");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_shop").setLabel("🛒 Shop").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_btn").setLabel("🎫 Support").setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // STOCK (COOL UI)
    if (interaction.commandName === "stock") {
      const embed = new EmbedBuilder()
        .setTitle("🛒 STORE STOCK")
        .setColor("#2b2d31")
        .setFooter({ text: "Fast • Safe • Trusted" });

      shopItems.forEach(item => {
        embed.addFields({
          name: `📦 ${item.name}`,
          value:
            `📊 Stock: ${item.stock}\n` +
            (item.variants
              ? item.variants.map(v => `💰 ${v.label}: $${v.price}`).join("\n")
              : `💰 Price: $${item.price}`),
          inline: true
        });
      });

      await interaction.reply({ embeds: [embed] });
    }
  }

  // ===== BUTTONS =====
  if (interaction.isButton()) {

    // OPEN SHOP MENU
    if (interaction.customId === "open_shop") {
      const options = [];

      shopItems.forEach(item => {
        if (item.variants) {
          item.variants.forEach(v => {
            options.push({
              label: `${item.name} (${v.label})`,
              description: `$${v.price}`,
              value: `${item.name}|${v.label}|${v.price}`
            });
          });
        } else {
          options.push({
            label: item.name,
            description: `$${item.price}`,
            value: `${item.name}|default|${item.price}`
          });
        }
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("select_item")
        .setPlaceholder("Select product")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.reply({
        content: "🛒 Select item to buy:",
        components: [row],
        ephemeral: true
      });
    }

    // TICKET
    if (interaction.customId === "ticket_btn") {
      const category = interaction.guild.channels.cache.find(
        c => c.name === "tickets" && c.type === ChannelType.GuildCategory
      );

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      await channel.send(`🎫 Ticket for ${interaction.user}`);
      await interaction.reply({ content: `✅ Created: ${channel}`, ephemeral: true });
    }

    // PAYMENT BUTTON
    if (interaction.customId.startsWith("paid_")) {
      const itemName = interaction.customId.replace("paid_", "");
      pendingProofs.set(interaction.user.id, itemName);

      await interaction.reply({
        content: "📸 Upload payment screenshot",
        ephemeral: true
      });
    }
  }

  // ===== SELECT MENU BUY =====
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_item") {

      const [name, variant, price] = interaction.values[0].split("|");

      const embed = new EmbedBuilder()
        .setTitle("💳 Payment")
        .setDescription(
          `📦 ${name}\n` +
          `📅 ${variant}\n` +
          `💰 $${price}\n\n` +
          `Pay via QRIS / PayPal\n${PAYMENT.paypalEmail}`
        )
        .setImage(PAYMENT.qrisImage)
        .setColor("Yellow");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`paid_${name}_${variant}`)
          .setLabel("✅ I Paid")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
  }
});

// ===== PROOF =====
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (!pendingProofs.has(msg.author.id)) return;

  const att = msg.attachments.first();
  if (!att || !att.contentType?.startsWith("image")) {
    return msg.reply("❌ Send image.");
  }

  const item = pendingProofs.get(msg.author.id);
  pendingProofs.delete(msg.author.id);

  const logChannel = msg.guild.channels.cache.find(c => c.name === "orders");

  logChannel?.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🧾 Payment Proof")
        .addFields(
          { name: "User", value: msg.author.tag },
          { name: "Item", value: item }
        )
        .setImage(att.url)
        .setColor("Green")
    ]
  });

  msg.reply("✅ Sent to admin.");
});

// ===== LOGIN =====
client.login(process.env.TOKEN);
