require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('fs');

// ---------- CONFIG ----------
const TOKEN = process.env.TOKEN;
const CATEGORY_ID = process.env.CATEGORY_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const SETUP_ROLE_ID = process.env.SETUP_ROLE_ID;

const TICKET_OPTIONS = [
  { key: 'genel', label: 'Genel Destek' },
  { key: 'yetkili', label: 'Yetkili Şikayet' },
  { key: 'partner', label: 'Partnerlik' },
  { key: 'diger', label: 'Diğer' }
];

const COUNTER_FILE = './ticket-counter.json';
let ticketCounter = { last: 0 };
if (fs.existsSync(COUNTER_FILE)) {
  try { ticketCounter = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')); } catch { ticketCounter = { last: 0 }; }
}
function saveCounter() { fs.writeFileSync(COUNTER_FILE, JSON.stringify(ticketCounter)); }

// ---------- Client ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once('ready', () => console.log(`✅ Bot aktif: ${client.user.tag}`));

// ---------- Helpers ----------
function buildSetupMessage() {
  const row = new ActionRowBuilder();
  TICKET_OPTIONS.forEach(opt => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_cat_${opt.key}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return {
    content: `🎫 **Phoenix Destek Sistemi**

Talep açtığınızda, “birisi bakabilir mi, merhaba, selam” gibi ifadeler kullanmak yerine direkt olarak sorununuzu belirtirseniz sizinle daha çabuk iletişim kurabiliriz. 💬

Ek olarak, destek açtığınız zaman yetkililere etiket atmanıza gerek yok. Zaten aktif olarak taleplerle ilgilenmekteyiz. Etiket atarak sadece meşgul etmiş olursunuz. 🚫

Destek taleplerinde sergileyeceğiniz üslup, hakaret, tehdit gibi davranışlarda yetkililerin destek talebini sonlandırma hakkı mevcuttur. ⚠️

🎫 **Elite Cheats Destek Sistemi**

Bir kategori seçin:`,
    components: [row]
  };
}

async function createTicketChannel(guild, user, categoryLabel) {
  ticketCounter.last += 1;
  saveCounter();
  const ticketNumber = ticketCounter.last;
  const channelName = `ticket-${ticketNumber}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
    ],
    topic: `Ticket #${ticketNumber} - ${user.tag} (${user.id}) | ${categoryLabel}`
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNumber}`)
    .setDescription(`Kategori: **${categoryLabel}**\nAçan: ${user}`)
    .setColor('Green')
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticketNumber}`).setLabel('Ticket Kapat').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketNumber}`).setLabel('Devral').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_add_${ticketNumber}`).setLabel('Üye Ekle').setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ content: `<@&${STAFF_ROLE_ID}> | ${user} tarafından yeni bir ticket açıldı.`, embeds: [embed], components: [buttons] });

  const log = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (log) log.send(`✅ Ticket oluşturuldu: ${channel} | Açan: ${user.tag}`);

  return channel;
}

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, guild, user, member, channel } = interaction;

  // Ticket kategorileri
  if (customId.startsWith('ticket_cat_')) {
    await interaction.deferReply({ ephemeral: true });
    const key = customId.replace('ticket_cat_', '');
    const opt = TICKET_OPTIONS.find(o => o.key === key);
    const categoryLabel = opt ? opt.label : key;
    try {
      const ch = await createTicketChannel(guild, user, categoryLabel);
      await interaction.editReply({ content: `🎫 Ticket oluşturuldu: ${ch}` });
    } catch (e) {
      console.error(e);
      await interaction.editReply({ content: 'Ticket oluşturulurken hata oluştu.' });
    }
    return;
  }

  // Ticket kapatma
  if (customId.startsWith('ticket_close_')) {
    const isStaff = member.roles.cache.has(STAFF_ROLE_ID) || member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isStaff) return interaction.reply({ content: 'Bunu yapmak için yetkin yok.', ephemeral: true });

    await interaction.reply({ content: 'Ticket kapatılıyor...', ephemeral: true });

    const log = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send(`❌ Ticket kapatıldı: ${channel.name} | Kapatan: ${user.tag}`);

    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 1000);
    return;
  }
});

// ---------- Komut: !ticket-setup ----------
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  if (msg.content.trim() === '!ticket-setup') {
    if (!msg.member.roles.cache.has(SETUP_ROLE_ID) && !msg.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return msg.reply('Bu komutu kullanmak için yetkin yok.');

    const setupMsg = buildSetupMessage();
    await msg.channel.send(setupMsg);
    msg.reply('✅ Ticket setup mesajı gönderildi.');
  }
});

// ---------- Login ----------
client.login(TOKEN);


