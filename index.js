require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
let chatStates = {};
const nivel1Options = [
  "Realizar reserva",
  "Consultar reserva",
  "Cancelar reserva",
];
let serviceOptions = {};
let sendObjectAPI = { nivel2: "barba", nivel3: "barbeiro2" };

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const response = await validaUser(chatId);
    if (response.exists) {
      saudacao(chatId, response.data.name);
      chatStates[chatId] = 1;
    } else {
      bot.sendMessage(
        chatId,
        `Olá, seja bem vindo ao bot da barbearia ${process.env.APP_NAME}!\nPara fazer o registro na barbearia e poder fazer reservas de horários, preciso que você compartilhe seu contato.`,
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "Compartilhar meu número de telefone",
                  request_contact: true,
                },
              ],
            ],
            one_time_keyboard: true,
          },
        }
      );
    }
  } catch (error) {
    errorMsg(chatId, error);
  }
});

bot.onText(/\/stop/, (msg) => {
  chatStates.unset(msg.chat.id);
});

bot.on("message", async (msg) => {
  if (!msg.contact && msg.text !== "/start") {
    const chatId = msg.chat.id;
    const valida = await validaUser(chatId);
    if (chatStates[chatId] === 1 && !nivel1Options.includes(msg.text)) {
      console.log("VALIDAÇÃO 1");
      bot.sendMessage(chatId, "Opção inválida! Digite novamente");
    } else {
      chatStates[chatId] = 2;
      return;
    }
    if (
      chatStates[chatId] === 2 &&
      !serviceOptions[chatId]?.includes(msg.text)
    ) {
      console.log("VALIDAÇÃO 2");
      console.log(msg.text);
      bot.sendMessage(chatId, `Opção inválida! Digite novamente`);
      mostrarOpcoes(
        chatId,
        `Selecione o serviço desejado:`,
        serviceOptions[chatId]
      );
    } else if (
      chatStates[chatId] === 2 &&
      serviceOptions[chatId]?.includes(msg.text)
    ) {
      console.log("VALIDAÇÃO 3");
      chatStates[chatId] = 3;
      console.log[chatStates];
      return;
    }
    if (valida.exists && (!chatStates[chatId] || chatStates[chatId] < 1)) {
      console.log("VALIDAÇÃO 4");
      saudacao(chatId, valida.data.name);
      chatStates[chatId] = 1;
    } else {
      registerUser(msg, chatId);
    }
  }
});

bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  registerUser(msg, chatId);
});

async function registerUser(msg, chatId) {
  const name = msg.contact ? msg.contact.first_name : msg.from.first_name;
  const phone = msg.contact ? msg.contact.phone_number : null;

  try {
    const response = await axios.post(`${process.env.API_URL}/client`, {
      chat_id: chatId,
      name: name,
      telephone: phone,
    });

    if (response.status === 201) {
      // saudacao(chatId, name);
    }
  } catch (error) {
    console.error(error);
    bot.sendMessage(
      chatId,
      "Houve um erro durante o registro. Por favor, tente novamente mais tarde."
    );
  }
}

bot.onText(/Realizar reserva/, async (msg) => {
  const chatId = msg.chat.id;
  const servicos = [];
  const options = [];
  try {
    const response = await axios.get(`${process.env.API_URL}/service`);
    if (response.status === 200) {
      response.data.map((each) => {
        servicos.push(each);
        options.push([each.category.name]);
      });
    }
    serviceOptions[chatId] = options;
    console.log(serviceOptions);
    mostrarOpcoes(chatId, "Selecione o serviço desejado:", options);
  } catch (error) {
    errorMsg(chatId, error);
  }
});

bot.onText(/Consultar reserva/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Você escolheu Consultar reserva. Vamos processar isso."
  );
});

bot.onText(/Cancelar reserva/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Você escolheu Cancelar reserva. Vamos processar isso."
  );
});

const errorMsg = (chatId, error) => {
  console.error(error);
  bot.sendMessage(
    chatId,
    "Houve um erro durante a consulta de seu registro. Por favor, tente novamente mais tarde."
  );
};

const validaUser = async (chatId) => {
  const resposta = {
    exists: false,
    data: {},
  };
  try {
    const response = await axios.get(
      `${process.env.API_URL}/client/search?chat_id=${chatId}`
    );
    if (response.status === 200) {
      if (response.data.id) {
        resposta.exists = true;
        resposta.data = response.data;
      }
    }
    return resposta;
  } catch (error) {
    errorMsg(chatId, error);
  }
};

const saudacao = (chatId, name) => {
  bot.sendMessage(chatId, `Olá, ${name}! Selecione a opção desejada:`, {
    reply_markup: {
      keyboard: [
        ["Realizar reserva"],
        ["Consultar reserva"],
        ["Cancelar reserva"],
      ],
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  });
};

const mostrarOpcoes = (chatId, options, text) => {
  bot.sendMessage(chatId, text, {
    reply_markup: {
      keyboard: options,
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  });
};
