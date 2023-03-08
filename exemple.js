const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const BufferStream = require("bufferstream");
const Bluebird = require("bluebird");
const { Readable } = require("stream");

let cash;

const app = express();

app.get("/", stream);

app.listen(3000, () => {
  console.log("listening");
});

// не большой контроллер
async function stream(request, response, next) {
  const { range } = request.headers;
  const audio = await play({
    audioId: "1",
    // backgroundAudioId: "2",
    // volumeBackgroundAudio: 0.2,
  });
  let start = 0;
  let end = audio.byteLength - 1;
  if (range !== undefined) {
    const [startByte, endByte] = range.replace(/bytes=/, "").split("-");
    start = parseInt(startByte, 10);
    if (endByte !== undefined && endByte.length > 1 && !isNaN(Number(endByte)))
      end = parseInt(endByte, 10);
    response.status(206).header({
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-+${end}/${audio.byteLength}`,
    });
  } else {
    response.header({
      "Content-Length": audio.byteLength,
    });
  }
  response
    .setHeader("Accept-Ranges", "bytes")
    .setHeader("Content-Type", "audio/mpeg");
  // а - ля передача аудио
  const stream = new Readable();
  stream._read = () => {};
  stream.push(audio.subarray(start, end));
  stream.push(null);
  stream.pipe(response);
}

async function play(args) {
  const { audioId, backgroundAudioId, volumeBackgroundAudio = 0 } = args;
  /* тут логика для работы c redis и всякие проверки */
  let audio;
  if (cash === undefined) {
    audio = await create(audioId, backgroundAudioId, volumeBackgroundAudio);
    cash = audio;
  } else {
    audio = cash;
  }
  /* тут логика для работы c redis */
  return audio;
}

function create(audioId, backgroundAudioId, volumeBackgroundAudio) {
  const audio = new BufferStream({ size: "flexible" }); // Buffer в который будет происходить запись созданного ffmpeg аудио данных
  const command = ffmpeg();
  return new Bluebird((resolve, reject) => {
    command.input(`./${audioId}.flac`);
    // Если необходимо добавить фоновую музыку, то накидываем еще пару данных для команд
    if (backgroundAudioId !== undefined) {
      command.input(`./${backgroundAudioId}.flac`);
      if (volumeBackgroundAudio !== undefined) {
        command.complexFilter([
          `[1:a]volume=1[a0]`,
          `[0:a]volume=${volumeBackgroundAudio}[a1]`,
          `[a1][a0]amix=duration=shortest:normalize=0[a]`,
        ]);
      }
      command.addOption("-map", `[a]`);
    }
    command
      .addOption("-c:v", "copy")
      .format("mp3")
      .output(audio, { end: true })
      .on("end", () => {
        console.log("audio created successfully");
        //после того как данные успешно аудио успешно создано возвращаем его
        resolve(audio.buffer);
      })
      .on("error", console.error)
      .run();
  });
}
