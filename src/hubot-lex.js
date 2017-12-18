"use strict";

// Description
//   A hubot script that interacts with AWS Lex.
//
// Configuration:
//   LEX_API_URL - Required. The URL for the AWS Lex API.
//   LEX_API_KEY - Optional. The x-api-key used for authenticating.
//   LEX_IGNORE_USER_IDS - Optional. A comman-separated string of HipChat user
//     IDs to ignore.
//   LEX_START_REGEXP - Optional. A RegExp for starting a conversation.
//
// Commands:
//   hubot LEX_START_REGEXP message - If a LEX_START_REGEXP is not specified,
//     the default /lex/i is used. THe command "hubot lex hello" would send the
//     text "lex hello" to AWS Lex.
//
// Author:
//   Ben Hanzl <ben.hanzl@gmail.com>

const _ = require("lodash");
const safe = require("safe-regex");

module.exports = (robot) => {
  const apiURL = process.env.LEX_API_URL;
  const apiKey = process.env.LEX_API_KEY;
  const defaultErrorMessage = "Unable to communicate with AWS Lex.";

  let ignoreUserIds = [];
  if (process.env.LEX_IGNORE_USER_IDS) {
    ignoreUserIds = process.env.LEX_IGNORE_USER_IDS.toLowerCase().split(",");
  }

  let startRegExp = /lex/i;

  if (!apiURL) {
    robot.logger.error("hubot-lex: LEX_API_URL not specified.");
    return;
  }

  const regExp = process.env.LEX_START_REGEXP;
  if (regExp && safe(regExp)) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    startRegExp = new RegExp(regExp, "i");
  } else {
    robot.logger.info("hubot-lex: LEX_START_REGEXP not specified or unsafe.");
  }

  robot.respond(/.+/i, (match) => {
    if (ignoreUserIds.includes(match.envelope.user.id.toLowerCase())) {
      robot.logger.info(`hubot-lex: Ignoring user ${match.envelope.user.id}`);
      return;
    }

    const conversationKey = `conversation-${match.envelope.room}`;
    const lastConversation = robot.brain.get(conversationKey);

    if (lastConversation) {
      robot.logger.info(`hubot-lex: Responding to last conversation: ${conversationKey} at ${lastConversation}.`);
    } else if (startRegExp.test(match.message.text)) {
      robot.logger.info(`hubot-lex: Responding to ${startRegExp.toString()}.`);
    } else {
      return;
    }

    const request = robot.http(apiURL)
      .header("Accept", "application/json")
      .header("Content-Type", "application/json");
    if (apiKey) {
      request.header("x-api-key", apiKey);
    }

    const message = match.message;
    message.text = message.text.replace(/(@hubot|Hubot:) /i, "").trim();

    request.post(JSON.stringify(message))((error, response, body) => {
      if (error) {
        robot.logger.error(`hubot-lex: ${error}`);
        match.reply(defaultErrorMessage);
        return;
      }

      if (response.statusCode !== 200) {
        const message = `${response.statusCode} ${JSON.parse(body).message}`;
        robot.logger.error(`hubot-lex: ${message}`);
        match.reply(defaultErrorMessage);
        return;
      }

      const data = JSON.parse(body);

      if (_.includes(["ConfirmIntent", "ElicitSlot"], data.dialogState)) {
        robot.logger.info(`hubot-lex: Starting conversation for ${conversationKey}`);
        robot.brain.set(conversationKey, Date.now());
      }

      if (_.includes(["ElicitIntent", "Failed", "Fulfilled", "ReadyForFulfillment"], data.dialogState)) {
        robot.logger.info(`hubot-lex: Stoping conversation for ${conversationKey}`);
        robot.brain.set(conversationKey, null);
      }

      if (data.message) {
        robot.logger.info(`hubot-lex: Response from AWS Lex: ${JSON.stringify(data)}`);
        match.reply(data.message);
      }
    });
  });
};
