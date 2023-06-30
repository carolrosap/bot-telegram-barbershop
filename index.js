require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

let chatStates = {};
let servicos = [];
let professionals = [];
let schedules = [];
let sendObjectAPI = {
  schedule_id: null,
  service_id: null,
  user_id: null
}

let datas = {}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Define as opções válidas para cada estado.
const stateOptions = {
  1: ["Realizar reserva", "Consultar reserva", "Cancelar reserva"],
  2: [],  // Populado dinamicamente quando o usuário escolhe "Realizar reserva".
  3: [],
  4: []
};

// Define as funções de manipulação para cada estado.
const stateHandlers = {
  1: handleState1,
  2: handleState2,
  3: handleState3,
  4: handleState4
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
      saudacao(chatId, name);
    }
  } catch (error) {
    console.error(error);
    bot.sendMessage(
      chatId,
      "Houve um erro durante o registro. Por favor, tente novamente mais tarde."
    );
  }
}

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

const mostrarOpcoes = (chatId, text, options) => {
  bot.sendMessage(chatId, text, {
    reply_markup: {
      keyboard: options,
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  });
};

const errorMsg = (chatId, error) => {
  console.error(error);
  bot.sendMessage(
    chatId,
    "Houve um erro durante a consulta de seu registro. Por favor, tente novamente mais tarde."
  );
};

bot.on("message", async (msg) => {
  if (!msg.contact && msg.text !== "/start") {
    const chatId = msg.chat.id;
    const userState = chatStates[chatId];
    if (datas[chatId] === undefined) {
      datas[chatId] = { sendObjectAPI, professional_id: null, user_name: null };
    }

    // Se o estado atual do usuário não tem um manipulador definido, registre o usuário.
    if (!stateHandlers[userState]) {
      const valida = await validaUser(chatId);
      if (valida.exists) {
        saudacao(chatId, valida.data.name);
        chatStates[chatId] = 1;
        const user_id = valida.data.id;
        const user_name = valida.data.nome;
        datas[chatId].user_name = user_name;
        datas[chatId].sendObjectAPI.user_id = user_id;
      } else {
        return registerUser(msg, chatId);
      }
    }

    // Se a mensagem não é uma opção válida para o estado atual, envie uma mensagem de erro.
    if (!stateOptions[userState]?.flat().includes(msg.text)) {
      return bot.sendMessage(chatId, "Opção inválida! Digite novamente");
    }

    // Se a mensagem é uma opção válida, execute o manipulador do estado.
    return await stateHandlers[userState](msg, chatId);
  }
});

bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  registerUser(msg, chatId);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  if (datas[chatId] === undefined) {
    datas[chatId] = { sendObjectAPI, professional_id: null, user_name: null };
  }
  try {
    const response = await validaUser(chatId);
    if (response.exists) {
      saudacao(chatId, response.data.name);
      chatStates[chatId] = 1;
      const user_id = response.data.id;
      const user_name = response.data.name;
      datas[chatId].user_name = user_name;
      datas[chatId].sendObjectAPI.user_id = user_id;
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

async function handleState1(msg, chatId) {
  switch (msg.text) {
    case "Realizar reserva":
      const options = [];
      try {
        const response = await axios.get(`${process.env.API_URL}/service`);
        if (response.status === 200) {
          response.data.map((each) => {
            servicos.push(each);
            options.push([each.category.name]);
          });
        }
        stateOptions[2] = options;
        chatStates[chatId] = 2;
        mostrarOpcoes(chatId, "Selecione o serviço desejado:", options);
      } catch (error) {
        errorMsg(chatId, error);
      }
      break;
    case "Consultar reserva":
      //bot.sendMessage(chatId, "Você escolheu Consultar reserva. Vamos processar isso.");
      const resposta = await consultaReservas(chatId);
      if(resposta.exists) {
        let msg = 'Você tem os seguintes horários agendados: \n'
        resposta.data.map((sch => {
          msg = msg + 'Dia ' + formatDate(sch.schedule.date) + ' às ' + formatTime(sch.schedule.time) + ' ' + sch.service.category.name + ' com o barbeiro ' + sch.service.professional.name + ' \n'
        }));
        msg = msg + '\nVolte ao menu para mais opções.';
        bot.sendMessage(chatId, msg);
      }else{
        bot.sendMessage(chatId, "Você não tem nenhum horário agendado ainda, faça um agendamento!");
      }
      chatStates[chatId] = 1;
      saudacao(chatId, datas[chatId].user_name);  
      break;
    case "Cancelar reserva":
      bot.sendMessage(chatId, "Você escolheu Cancelar reserva. Vamos processar isso.");
      break;
  }
}

async function handleState2(msg, chatId) {
  const service = servicos.find((item) => item.category.name === msg.text);
  let options = [];
  if (service) {
    datas[chatId].sendObjectAPI.service_id = service.id;
    const categoryId = service.category_id;
    try {
      const response = await axios.get(
        `${process.env.API_URL}/professional?categoryId=${categoryId}`
      );
      if (response.status === 200) {
        professionals = response.data.length > 0 ? response.data : {};
      }
    } catch (error) {
      errorMsg(chatId, error);
    }
    professionals.map((prof) => {
      options.push([prof.name])
    });
    stateOptions[3] = options;
    chatStates[chatId] = 3;
    mostrarOpcoes(chatId, "Certo! Com qual barbeiro gostaria de realizar o serviço?", options);
  }
}

async function handleState3(msg, chatId) {
  const professional = professionals.find((prof) => prof.name === msg.text);
  let options = [];
  if (professional) {
    const professionalId = professional.id;
    datas[chatId].professional_id = professionalId;
    let schedulesAux = []
    try {
      const response = await axios.get(
        `${process.env.API_URL}/schedule?available=1&userId=${professionalId}`
      );
      if (response.status === 200) {
        schedulesAux = response.data.length > 0 ? response.data : {};
      }
    } catch (error) {
      errorMsg(chatId, error);
    }
    schedulesAux.map((sch) => {
      const exibicao = formatDate(sch.date) + " às " + formatTime(sch.time);
      options.push([exibicao]);
      schedules.push({ ...sch, exhibition: exibicao });
    });
    stateOptions[4] = options;
    chatStates[chatId] = 4;
    mostrarOpcoes(chatId, "Escolha um dos horários disponíveis: ", options);
  }
}

async function handleState4(msg, chatId) {
  const schedule = schedules.find((sch) => sch.exhibition === msg.text);
  if (schedule) {
    const scheduleId = schedule.id;
    datas[chatId].sendObjectAPI.schedule_id = scheduleId;
  }
  await saveData(chatId);
}

async function saveData(chatId) {
  try {
    const response = await axios.post(`${process.env.API_URL}/scheduling`, datas[chatId].sendObjectAPI);
    if (response.status === 201) {
      bot.sendMessage(
        chatId,
        "Horário reservado com sucesso!\nAgora você pode voltar ao menu para selecionar outras opções!"
      );
      chatStates[chatId] = 1;
      datas[chatId].sendObjectAPI.schedule_id = null;
      datas[chatId].sendObjectAPI.service_id = null;
      datas[chatId].professional_id = null;
    }
  } catch (error) {
    console.error(error);
    bot.sendMessage(
      chatId,
      "Houve um erro ao fazer a reserva. Por favor, tente novamente mais tarde."
    );
  }
  saudacao(chatId, datas[chatId]?.user_name);

}

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const day = ("0" + date.getDate()).slice(-2);
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();
  const formattedDate = `${day}/${month}/${year}`;
  return formattedDate;
}

const formatTime = (timeString) => {
  const parts = timeString.split(":");
  const formattedTime = `${parts[0]}:${parts[1]}`;
  return formattedTime;
}

const consultaReservas = async (chatId) => {
  const resposta = {
    exists: false,
    data: {},
  };
  const user_id = datas[chatId].sendObjectAPI.user_id;
  try {
    const response = await axios.get(
      `${process.env.API_URL}/scheduling?userId=${user_id}`
    );
    if (response.status === 200) {
      if (response.data.length > 0 ) {
        resposta.exists = true;
        resposta.data = response.data;
      }
    }
    return resposta;
  } catch (error) {
    errorMsg(chatId, error);
  }
};