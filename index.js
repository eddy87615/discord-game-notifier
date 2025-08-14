require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  REST,
  Routes,
} = require("discord.js");

// 初始化全域變數
global.pendingNotifications = global.pendingNotifications || {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// 清理過期的通知數據（每 10 分鐘清理一次）
setInterval(() => {
  const now = Date.now();
  Object.keys(global.pendingNotifications).forEach((key) => {
    const notification = global.pendingNotifications[key];
    // 如果通知超過 10 分鐘就清理
    if (
      notification.timestamp &&
      now - notification.timestamp > 10 * 60 * 1000
    ) {
      delete global.pendingNotifications[key];
      console.log(`🗑️  清理過期通知: ${key}`);
    }
  });
}, 10 * 60 * 1000); // 每 10 分鐘執行一次

// 註冊 Slash Commands
async function registerCommands() {
  if (!process.env.CLIENT_ID) {
    console.error("❌ 請在 .env 檔案中設定 CLIENT_ID");
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("notify")
      .setDescription("發送通知訊息")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(
    process.env.DISCORD_BOT_TOKEN
  );

  try {
    console.log("🔄 開始註冊應用程式 (/) 指令...");
    console.log(`📋 CLIENT_ID: ${process.env.CLIENT_ID}`);

    // 註冊全域指令
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ 成功註冊 ${data.length} 個應用程式指令`);
    console.log("⏰ 全域指令可能需要 1-5 分鐘才會在所有伺服器生效");
  } catch (error) {
    console.error("❌ 註冊指令失敗:", error);

    // 如果是權限問題，提供詳細說明
    if (error.code === 50001) {
      console.error("🚨 權限不足！請檢查：");
      console.error("1. Bot Token 是否正確");
      console.error("2. CLIENT_ID 是否正確");
      console.error("3. Bot 是否有 applications.commands 權限");
    }
  }
}

client.once("ready", async () => {
  console.log(`🤖 Bot 已啟動: ${client.user.tag}`);
  console.log(`🏠 Bot 在 ${client.guilds.cache.size} 個伺服器中`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`🆔 Client ID: ${process.env.CLIENT_ID || "❌ 未設定"}`);

  // 檢查 CLIENT_ID 是否與 Bot ID 相同
  if (process.env.CLIENT_ID && process.env.CLIENT_ID !== client.user.id) {
    console.error("⚠️  警告：CLIENT_ID 與 Bot ID 不符！");
    console.error(`   CLIENT_ID: ${process.env.CLIENT_ID}`);
    console.error(`   Bot ID: ${client.user.id}`);
    console.error("   請確保 CLIENT_ID 是正確的 Application ID");
  }

  // 註冊 Slash Commands
  await registerCommands();

  // 列出所有已註冊的指令
  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_BOT_TOKEN
    );
    const commands = await rest.get(
      Routes.applicationCommands(process.env.CLIENT_ID)
    );
    console.log(
      `📋 已註冊的指令: ${commands.map((cmd) => cmd.name).join(", ")}`
    );
  } catch (error) {
    console.error("❌ 無法獲取已註冊的指令:", error.message);
  }

  console.log("");
  console.log("🔧 如果 /notify 指令還是無法使用，請嘗試：");
  console.log("1. 確保在正確的伺服器中測試");
  console.log("2. 等待最多 1 小時讓全域指令生效");
  console.log("3. 重新啟動 Discord 應用程式");
  console.log("4. 嘗試使用備用指令：!notify");
  console.log("5. 檢查 Bot 在該伺服器是否有發送訊息權限");
  console.log("");
});

// 處理所有互動
client.on("interactionCreate", async (interaction) => {
  console.log(
    `🔄 收到互動: ${interaction.type} - ${
      interaction.customId || interaction.commandName || "unknown"
    }`
  );

  try {
    if (interaction.isChatInputCommand()) {
      console.log(`📝 處理 Slash Command: ${interaction.commandName}`);
      if (interaction.commandName === "notify") {
        await showNotificationTypeButtons(interaction);
      }
    } else if (interaction.isButton()) {
      console.log(`🔘 處理按鈕點擊: ${interaction.customId}`);

      if (interaction.customId.startsWith("type_")) {
        await handleButtonInteraction(interaction);
      } else if (interaction.customId.startsWith("confirm_")) {
        await handleConfirmButton(interaction);
      } else if (interaction.customId === "cancel_notification") {
        await interaction.reply({
          content: "❌ 已取消發送通知",
          ephemeral: true,
        });
      } else if (interaction.customId.startsWith("reaction_")) {
        await handleReactionButton(interaction);
      }
    } else if (interaction.isStringSelectMenu()) {
      console.log(`📋 處理下拉選單選擇: ${interaction.customId}`);
      if (interaction.customId.startsWith("channel_select_")) {
        await handleChannelSelectMenu(interaction);
      }
    } else if (interaction.isModalSubmit()) {
      console.log(`📋 處理 Modal 提交: ${interaction.customId}`);
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error("❌ 處理互動時發生錯誤:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 處理請求時發生錯誤，請稍後再試",
          ephemeral: true,
        });
      } catch (replyError) {
        console.error("❌ 無法回覆錯誤訊息:", replyError);
      }
    }
  }
});

// 顯示通知類別選擇按鈕
async function showNotificationTypeButtons(interaction) {
  const embed = new EmbedBuilder()
    .setColor("#0099FF")
    .setTitle("📢 選擇通知類別")
    .setDescription("請選擇您要發送的通知類型：")
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("type_boss")
      .setLabel("🐉 野王通知")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("type_team")
      .setLabel("🎮 開團通知")
      .setStyle(ButtonStyle.Success),
    // new ButtonBuilder()
    //   .setCustomId("type_recruit")
    //   .setLabel("👥 招募通知")
    //   .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("type_general")
      .setLabel("📝 一般通知")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("type_urgent")
      .setLabel("🚨 緊急通知")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    embeds: [embed],
    components: [buttons],
    ephemeral: true, // 只有發送者可以看到
  });
}

// 處理按鈕點擊 - 顯示頻道選擇
async function handleButtonInteraction(interaction) {
  const notificationTypes = {
    type_boss: {
      title: "🐉 野王通知",
      color: "#FF0000",
      placeholder: "例如：殭屍菇菇出現了！！",
      emoji: "🐉",
    },
    type_team: {
      title: "🎮 開團通知",
      color: "#00FF00",
      placeholder: "例如：101缺速缺補！拉圖斯缺大法ＱＱ",
      emoji: "🎮",
    },
    type_general: {
      title: "📝 一般通知",
      color: "#FFA500",
      placeholder: "例如：今天有活動，大家記得參加！",
      emoji: "📝",
    },
    type_urgent: {
      title: "🚨 緊急通知",
      color: "#FF1493",
      placeholder: "例如：緊急集合！健太跟燒肉要結婚了！",
      emoji: "🚨",
    },
  };

  const typeInfo = notificationTypes[interaction.customId];
  if (!typeInfo) return;

  await showChannelSelectMenu(interaction, interaction.customId, typeInfo);
}

// 顯示頻道選擇下拉選單
async function showChannelSelectMenu(interaction, notificationType, typeInfo) {
  const embed = new EmbedBuilder()
    .setColor(typeInfo.color)
    .setTitle(`${typeInfo.emoji} ${typeInfo.title}`)
    .setDescription("請選擇要發送通知的頻道：")
    .setTimestamp();

  const channelOptions = [];
  
  // 從 .env 檔案中獲取頻道ID並創建選項
  if (process.env.NOTIFY_CHANNEL_IDS) {
    const envChannelIds = process.env.NOTIFY_CHANNEL_IDS.split(",");
    
    // 添加全部頻道選項
    channelOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel("📌 全部頻道")
        .setDescription("發送到所有設定的頻道")
        .setValue("all_channels")
        .setEmoji("📌")
    );
    
    // 為每個頻道創建選項
    for (const channelId of envChannelIds) {
      try {
        const channel = interaction.guild.channels.cache.get(channelId.trim());
        if (channel && channel.isTextBased()) {
          channelOptions.push(
            new StringSelectMenuOptionBuilder()
              .setLabel(`# ${channel.name}`)
              .setDescription(`頻道 ID: ${channel.id}`)
              .setValue(channel.id)
              .setEmoji("📝")
          );
        }
      } catch (error) {
        console.log(`⚠️  找不到頻道ID: ${channelId}`);
      }
    }
  } else {
    // 如果沒有設定環境變數，顯示錯誤訊息
    channelOptions.push(
      new StringSelectMenuOptionBuilder()
        .setLabel("❌ 未設定頻道")
        .setDescription("請在 .env 檔案中設定 NOTIFY_CHANNEL_IDS")
        .setValue("no_channels")
        .setEmoji("❌")
    );
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`channel_select_${notificationType}_${Date.now()}`)
    .setPlaceholder("選擇一個或多個頻道...")
    .addOptions(channelOptions)
    .setMinValues(1)
    .setMaxValues(Math.min(channelOptions.length, 10)); // 最多選10個頻道

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({
    embeds: [embed],
    components: [selectRow],
    ephemeral: true,
  });
}

// 處理頻道選擇下拉選單
async function handleChannelSelectMenu(interaction) {
  const customId = interaction.customId;
  const selectedChannels = interaction.values;
  
  // 解析 customId 來獲取通知類型
  const parts = customId.split('_');
  const notificationType = `${parts[2]}_${parts[3]}`;
  
  // 獲取通知類型資訊
  const notificationTypes = {
    type_boss: {
      title: "🐉 野王通知",
      color: "#FF0000",
      placeholder: "例如：殭屍菇菇出現了！！",
      emoji: "🐉",
    },
    type_team: {
      title: "🎮 開團通知",
      color: "#00FF00",
      placeholder: "例如：101缺速缺補！拉圖斯缺大法ＱＱ",
      emoji: "🎮",
    },
    type_general: {
      title: "📝 一般通知",
      color: "#FFA500",
      placeholder: "例如：今天有活動，大家記得參加！",
      emoji: "📝",
    },
    type_urgent: {
      title: "🚨 緊急通知",
      color: "#FF1493",
      placeholder: "例如：緊急集合！健太跟燒肉要結婚了！",
      emoji: "🚨",
    },
  };

  const typeInfo = notificationTypes[notificationType];
  if (!typeInfo) return;

  // 創建 Modal
  const modal = new ModalBuilder()
    .setCustomId(`modal_${notificationType}_${Date.now()}`)
    .setTitle(typeInfo.title);

  const messageInput = new TextInputBuilder()
    .setCustomId("notification_message")
    .setLabel("請輸入通知訊息")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(typeInfo.placeholder)
    .setMinLength(1)
    .setMaxLength(1000)
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("notification_description")
    .setLabel("詳細說明（可選）")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("例如：等級限制，其他備註...")
    .setMaxLength(500)
    .setRequired(false);

  const firstActionRow = new ActionRowBuilder().addComponents(messageInput);
  const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);

  modal.addComponents(firstActionRow, secondActionRow);

  // 儲存頻道選擇到臨時變數
  const tempId = `${notificationType}_${Date.now()}`;
  global.pendingNotifications = global.pendingNotifications || {};
  global.pendingNotifications[`channels_${tempId}`] = {
    channels: selectedChannels,
    timestamp: Date.now(),
  };

  // 更新 modal customId 以包含臨時 ID
  modal.setCustomId(`modal_${tempId}`);

  await interaction.showModal(modal);
}

// 處理 Modal 提交
async function handleModalSubmit(interaction) {
  const modalId = interaction.customId;
  const tempId = modalId.replace("modal_", "");
  
  // 從 tempId 解析通知類型 (格式: type_name_timestamp)
  const parts = tempId.split('_');
  const notificationType = parts.length >= 3 ? `${parts[0]}_${parts[1]}` : parts[0];
  
  const message = interaction.fields.getTextInputValue("notification_message");
  const description =
    interaction.fields.getTextInputValue("notification_description") || "";
  
  // 從臨時儲存中獲取頻道選擇
  const channelData = global.pendingNotifications[`channels_${tempId}`];
  const selectedChannels = channelData ? channelData.channels : [];
  console.log(`🔍 tempId: ${tempId}, 找到頻道數據: ${channelData ? '是' : '否'}, 選擇的頻道: ${JSON.stringify(selectedChannels)}`);

  const typeConfig = {
    type_boss: {
      title: "🐉 野王通知",
      color: "#FF0000",
      alertLevel: "@here",
    },
    type_team: {
      title: "🎮 開團通知",
      color: "#00FF00",
      alertLevel: "@here",
    },
    type_general: {
      title: "📝 一般通知",
      color: "#FFA500",
      alertLevel: "@here",
    },
    type_urgent: {
      title: "🚨 緊急通知",
      color: "#FF1493",
      alertLevel: "@everyone",
    },
  };

  const config = typeConfig[notificationType];
  console.log(`🔍 解析通知類型: ${notificationType}, 找到設定: ${config ? '是' : '否'}`);
  if (!config) return;

  // 生成唯一的確認 ID
  const timestamp = Date.now();
  const confirmId = `confirm_${notificationType}_${timestamp}`;

  // 創建確認訊息
  const confirmEmbed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle("📋 通知預覽")
    .setDescription("請確認要發送的通知內容：")
    .addFields(
      { name: "通知類型", value: config.title, inline: true },
      { name: "發送者", value: interaction.user.username, inline: true },
      { name: "提醒等級", value: config.alertLevel, inline: true },
      { name: "通知訊息", value: message, inline: false }
    )
    .setFooter({ text: "此預覽將在 10 分鐘後過期" })
    .setTimestamp();

  // 顯示選擇的頻道
  if (selectedChannels && selectedChannels.length > 0) {
    let channelDisplay = "";
    for (const channelValue of selectedChannels) {
      if (channelValue === "all_channels") {
        channelDisplay += "📌 全部頻道\n";
      } else if (channelValue === "no_channels") {
        channelDisplay += "❌ 未設定頻道\n";
      } else {
        try {
          const channel = interaction.guild.channels.cache.get(channelValue);
          channelDisplay += `# ${channel ? channel.name : channelValue}\n`;
        } catch {
          channelDisplay += `# ${channelValue}\n`;
        }
      }
    }
    confirmEmbed.addFields({
      name: "選擇的頻道",
      value: channelDisplay.trim(),
      inline: false,
    });
  }

  if (description) {
    confirmEmbed.addFields({
      name: "詳細說明",
      value: description,
      inline: false,
    });
  }

  const confirmButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId) // 使用相同的 confirmId
      .setLabel("✅ 確認發送")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("cancel_notification")
      .setLabel("❌ 取消")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmButtons],
    ephemeral: true,
  });

  // 儲存通知數據到臨時變數
  global.pendingNotifications = global.pendingNotifications || {};
  global.pendingNotifications[confirmId] = {
    type: notificationType,
    config: config,
    message: message,
    description: description,
    selectedChannels: selectedChannels,
    sender: interaction.user,
    timestamp: timestamp,
  };
  
  // 清理臨時頻道數據
  delete global.pendingNotifications[`channels_${tempId}`];

  console.log(`💾 已儲存通知數據: ${confirmId}`);
}

// 分離處理函數
async function handleConfirmButton(interaction) {
  const confirmId = interaction.customId;

  console.log(`🔍 尋找通知數據: ${confirmId}`);
  console.log(
    `📋 現有的通知數據: ${Object.keys(global.pendingNotifications || {}).join(
      ", "
    )}`
  );

  const notificationData = global.pendingNotifications?.[confirmId];

  if (!notificationData) {
    console.log(`❌ 找不到通知數據: ${confirmId}`);
    await interaction.reply({
      content: "❌ 通知數據已過期或不存在，請重新使用 /notify 指令",
      ephemeral: true,
    });
    return;
  }

  // 檢查數據是否過期（10分鐘）
  const now = Date.now();
  const elapsed = now - notificationData.timestamp;
  const maxAge = 10 * 60 * 1000; // 10分鐘

  console.log(
    `⏰ 數據年齡: ${Math.floor(elapsed / 1000)} 秒 (最大: ${Math.floor(
      maxAge / 1000
    )} 秒)`
  );

  if (elapsed > maxAge) {
    delete global.pendingNotifications[confirmId];
    console.log(`🗑️  數據已過期，已清理: ${confirmId}`);
    await interaction.reply({
      content: "❌ 通知數據已過期（超過10分鐘），請重新使用 /notify 指令",
      ephemeral: true,
    });
    return;
  }

  try {
    await sendNotificationToChannels(notificationData, interaction);
    await sendPrivateNotifications(notificationData, interaction);

    await interaction.reply({
      content: "✅ 通知已成功發送！",
      ephemeral: true,
    });

    // 清理臨時數據
    delete global.pendingNotifications[confirmId];

    console.log(
      `📤 通知發送成功: ${notificationData.type} - ${notificationData.sender.username}`
    );
  } catch (error) {
    console.error("發送通知失敗:", error);
    await interaction.reply({
      content: "❌ 發送通知時發生錯誤，請稍後再試",
      ephemeral: true,
    });
  }
}

async function handleReactionButton(interaction) {
  const reactionResponses = {
    reaction_seen: { emoji: "👀", text: "已記錄你看到了這個通知" },
    reaction_interested: { emoji: "👍", text: "已記錄你對此感興趣！" },
    reaction_join: { emoji: "🚀", text: "太棒了！已記錄你要參加！" },
  };

  const response = reactionResponses[interaction.customId];
  if (response) {
    await interaction.reply({
      content: `${response.emoji} ${response.text}`,
      ephemeral: true,
    });

    console.log(`${interaction.user.username} 點擊了: ${interaction.customId}`);
  }
}

// 發送通知到指定頻道
async function sendNotificationToChannels(notificationData, interaction) {
  let notifyChannels = [];

  console.log(`📤 發送通知，選擇的頻道: ${JSON.stringify(notificationData.selectedChannels)}`);
  
  // 如果用戶有指定頻道，使用用戶指定的頻道
  if (notificationData.selectedChannels && notificationData.selectedChannels.length > 0) {
    for (const channelValue of notificationData.selectedChannels) {
      try {
        if (channelValue === "all_channels") {
          // 使用所有設定的頻道
          const allChannels = process.env.NOTIFY_CHANNEL_IDS?.split(",").map(id => id.trim()) || [];
          notifyChannels.push(...allChannels);
        } else if (channelValue !== "no_channels") {
          // 直接使用頻道ID (從下拉選單選擇的都是ID)
          notifyChannels.push(channelValue);
        }
      } catch (error) {
        console.error(`❌ 解析頻道時出錯 "${channelValue}":`, error.message);
      }
    }
  } else {
    // 如果用戶沒有指定頻道，使用環境變數設定的預設頻道
    notifyChannels = process.env.NOTIFY_CHANNEL_IDS?.split(",").map(id => id.trim()) || [];
  }

  if (notifyChannels.length === 0) {
    console.log("未設定通知頻道且未指定頻道");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(notificationData.config.color)
    .setTitle(` ${notificationData.config.title}`)
    .addFields(
      { name: "📝 通知內容", value: notificationData.message, inline: false },
      {
        name: "👤 發送者",
        value: notificationData.sender.username,
        inline: true,
      },
      {
        name: "⏰ 時間",
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      }
    )
    .setThumbnail(notificationData.sender.displayAvatarURL())
    .setFooter({ text: `通知類型: ${notificationData.config.title}` })
    .setTimestamp();

  if (notificationData.description) {
    embed.addFields({
      name: "📋 詳細說明",
      value: notificationData.description,
      inline: false,
    });
  }

  //   const buttons = new ActionRowBuilder().addComponents(
  //     new ButtonBuilder()
  //       .setCustomId("reaction_seen")
  //       .setLabel("👀 已看到")
  //       .setStyle(ButtonStyle.Secondary),
  //     new ButtonBuilder()
  //       .setCustomId("reaction_interested")
  //       .setLabel("👍 感興趣")
  //       .setStyle(ButtonStyle.Primary),
  //     new ButtonBuilder()
  //       .setCustomId("reaction_join")
  //       .setLabel("🚀 我要參加")
  //       .setStyle(ButtonStyle.Success)
  //   );

  for (const channelId of notifyChannels) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await channel.send({
          content: `${notificationData.config.alertLevel} ${notificationData.config.title}`,
          embeds: [embed],
          //   components: [buttons],
        });
        console.log(`✅ 通知已發送到頻道: ${channel.name} (${channelId})`);
      }
    } catch (error) {
      console.error(`❌ 無法發送通知到頻道 ${channelId}:`, error.message);
    }
  }

  console.log(`📊 總共發送到 ${notifyChannels.length} 個頻道`);
}

// 發送私訊通知
async function sendPrivateNotifications(notificationData, interaction) {
  const notifyUserIds = process.env.NOTIFY_USER_IDS?.split(",") || [];

  if (notifyUserIds.length === 0) return;

  const embed = new EmbedBuilder()
    .setColor(notificationData.config.color)
    .setTitle(`📢 ${notificationData.config.title}`)
    .setDescription(
      `有新的通知從 **${interaction.guild?.name || "Discord"}** 發送！`
    )
    .addFields(
      { name: "發送者", value: notificationData.sender.username, inline: true },
      {
        name: "時間",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: true,
      },
      { name: "通知內容", value: notificationData.message, inline: false }
    )
    .setThumbnail(notificationData.sender.displayAvatarURL())
    .setFooter({ text: `通知類型: ${notificationData.config.title}` })
    .setTimestamp();

  if (notificationData.description) {
    embed.addFields({
      name: "詳細說明",
      value: notificationData.description,
      inline: false,
    });
  }

  for (const userId of notifyUserIds) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
      console.log(`✅ 私訊通知已發送給: ${user.username}`);
    } catch (error) {
      console.error(`❌ 無法發送私訊給用戶 ${userId}:`, error.message);
    }
  }
}

// 處理一般訊息（作為備用方案和測試）
client.on("messageCreate", async (message) => {
  // 忽略 Bot 訊息
  if (message.author.bot) return;

  // 檢查是否為觸發指令
  if (
    message.content === "!notify" ||
    message.content === "/notify" ||
    message.content === "!通知"
  ) {
    console.log(
      `📝 收到手動指令: ${message.content} 來自 ${message.author.username}`
    );

    // 刪除原始訊息
    try {
      await message.delete();
    } catch (error) {
      console.log("⚠️  無法刪除訊息 (可能權限不足)");
    }

    // 創建假的 interaction 物件來重用現有邏輯
    const fakeInteraction = {
      user: message.author,
      guild: message.guild,
      channel: message.channel,
      replied: false,
      deferred: false,
      reply: async (options) => {
        const msg = await message.channel.send({
          ...options,
          // 如果是 ephemeral，就不要發送到頻道
          content: options.ephemeral
            ? undefined
            : `${message.author} ${options.content || ""}`,
        });

        // 如果是 ephemeral，10秒後刪除
        if (options.ephemeral) {
          setTimeout(async () => {
            try {
              await msg.delete();
            } catch (error) {
              console.log("無法刪除臨時訊息");
            }
          }, 10000);
        }

        return msg;
      },
    };

    try {
      await showNotificationTypeButtons(fakeInteraction);
      console.log("✅ 成功顯示通知類型按鈕");
    } catch (error) {
      console.error("❌ 顯示通知按鈕失敗:", error);
      await message.channel.send("❌ 無法顯示通知選項，請稍後再試");
    }
    return;
  }

  // 測試指令
  if (message.content === "!test" || message.content === "!測試") {
    await message.reply(`✅ Bot 運行正常！
📊 狀態資訊:
- Bot: ${client.user.tag}
- 伺服器數量: ${client.guilds.cache.size}
- 可用指令: /notify, !notify, !通知
- 權限: ${
      message.guild.members.me.permissions.has("SendMessages") ? "✅" : "❌"
    } 發送訊息`);
  }
});

// 錯誤處理
client.on("error", (error) => {
  console.error("Discord client 錯誤:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("未處理的 Promise 錯誤:", error);
});

// 登入 Bot
client.login(process.env.DISCORD_BOT_TOKEN);
