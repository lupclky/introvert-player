const fs = require('fs');
const path = require('path');

function getWordTimestamps(filename) {
  const content = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  // Match word chunks: word or tag <hh:mm:ss.mmm>
  const lines = content.split('\n');
  const words = [];
  let currentTime = 0;

  for (let line of lines) {
    line = line.trim();
    const cueMatch = line.match(/^(\d{2}):(\d{2}):(\d{2}\.\d{3})\s+-->/);
    if (cueMatch) {
      currentTime = parseInt(cueMatch[1]) * 3600 + parseInt(cueMatch[2]) * 60 + parseFloat(cueMatch[3]);
      continue;
    }
    if (line.startsWith('WEBVTT') || line.startsWith('Kind:') || line.startsWith('Language:')) continue;

    // Parse inline timestamps e.g. Mở<00:00:05.759><c> hảo</c>
    const tokens = line.split(/(<[0-9:.]+>|<\/?c>)/);
    for (let t of tokens) {
      t = t.trim();
      if (!t) continue;
      const tMatch = t.match(/^<(\d{2}):(\d{2}):(\d{2}\.\d{3})>$/);
      if (tMatch) {
        currentTime = parseInt(tMatch[1]) * 3600 + parseInt(tMatch[2]) * 60 + parseFloat(tMatch[3]);
      } else if (t.startsWith('<') && t.endsWith('>')) {
        // Tag
      } else if (t !== '[âm nhạc]' && t !== '>>') {
        words.push({ time: currentTime, word: t.toLowerCase() });
      }
    }
  }
  return words;
}

const words = getWordTimestamps('exit_sign_song26.vi-orig.vtt');
console.log('Total words:', words.length);

// Let's find each lyric line's start from the words
const official = [
  { prefix: "anh không nhớ nổi", text: "Anh không nhớ nổi lần cuối cùng anh nhìn vào mắt em đó là từ bao giờ" },
  { prefix: "em từng trách", text: "Em từng trách anh chỉ ôm ước mơ, còn không sợ mất em thì làm sao chờ?" },
  { prefix: "lúc", text: "Lúc đó anh có xin lỗi hay không thì kết quả nó cũng như nhau mà" },
  { prefix: "cuối cùng thì", text: "Cuối cùng thì hai ta đều ích kỷ, nông nổi, tự trọng cao mà" },
  { prefix: "ta từng", text: "Ta từng bắt gặp nhau ở khắp Sài Gòn, chắc là lúc còn yêu thì muốn tránh cũng khó" },
  { prefix: "không thể tin", text: "Không thể tin là mình chưa từng gặp lại sau khi mà anh bước qua cánh cửa đó" },
  { prefix: "tình yêu mình", text: "Tình yêu mình từng là ánh lửa đỏ, từng là chim sẻ cố đập cánh giữa gió" },
  { prefix: "cố gắng sống", text: "Cố gắng sống hai cuộc đời, chắc là thằng nhóc này muốn làm thần thánh nữa đó" },
  { prefix: "sao", text: "Sao giờ em xuất hiện tại đây vậy? Cuối hàng khán giả với cánh tay vẫy" },
  { prefix: "em từng cùng", text: "Em từng cùng anh đứng ở hậu trường và cùng anh về nhà sau khi mà bay nhảy" },
  { prefix: "cũng từng nói", text: "Cũng từng nói, \"Em không có gạt anh, em thích nhạc anh\", and you know the vision" },
  { prefix: "anh từng hứa", text: "Anh từng hứa là mình không nhạt đâu, sẽ không lạc nhau, cùng bên nhau vào khi cần" },
  { prefix: "ngay lúc đó", text: "Ngay lúc đó anh chỉ muốn lao xuống, anh thật sự tò mò, em dạo này khỏe không?" },
  { prefix: "nhưng mà sao", text: "Nhưng mà sao hôm nay em đi khuya vậy? Ba mẹ em biết là ba mẹ sẽ trông" },
  { prefix: "anh từng mong", text: "Anh từng mong em hạnh phúc, tới khi em nở nụ cười, anh như bị đâm mười nhát" },
  { prefix: "khi anh đứng", text: "Khi anh đứng trên sân khấu một mình, còn em đứng cạnh cùng với một người khác" },
  { prefix: "em hiểu rằng", text: "Em hiểu rằng chúng ta không ai là sai" },
  { prefix: "chỉ là em", text: "Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai" },
  { prefix: "mãi sau", text: "Mãi sau những điều anh cho là lý do để anh tồn tại" },
  { prefix: "vậy đâu còn", text: "Vậy đâu còn lý do để em ở lại?" },
  { prefix: "đây sẽ là", text: "Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài" },
  { prefix: "so thanks", text: "So thanks for showing me the exit sign" },
  { prefix: "chưa nói tới", text: "Chưa nói tới đúng sai nhưng chuyến xe dừng lại là do chân anh đặt trên phanh" },
  { prefix: "anh đã không", text: "Anh đã không ngần ngại chia con đường làm hai vì anh nghĩ là anh quên nhanh" },
  { prefix: "gặp một cô", text: "Gặp một cô gái mới coi là cả thế giới, viết tên cả hai lên tranh" },
  { prefix: "không dễ nhiều", text: "Không dễ nhiều đêm trắng để chờ lên nắng, giờ thì ký ức gọi tên anh" },
  { prefix: "nên là cứ", text: "Nên là cứ rót đi, bàn vẫn ướt mặc dù có lót ly" },
  { prefix: "ước gì có", text: "Ước gì có thể paste nỗi đau này qua chỗ khác, nhưng không, nó nhân lên, nó chỉ copy" },
  { prefix: "thật khó để", text: "Thật khó để nhìn xung quanh khi chỉ trông ngóng vì sao như Tsiolkovsky" },
  { prefix: "để bây giờ", text: "Để bây giờ em đi mất, liên kết còn lại tồn tại giữa anh và em là chung một tài khoản Shopee" },
  { prefix: "gom hết tất", text: "Gom hết tất cả về em xong rồi thiêu nhanh" },
  { prefix: "giọng em vang", text: "Giọng em vang lên trước khi môi em mở, găm thẳng vào anh như là siêu thanh" },
  { prefix: "không cần phải", text: "Không cần phải là người giỏi toán, đủ biết đây không phải đổi ngang" },
  { prefix: "em chỉ mất", text: "Em chỉ mất đi một thằng thất bại, anh mất đi một người yêu anh" },
  { prefix: "8515", text: "8515 lần nói anh yêu em ở trong Mess nếu mà em search" },
  { prefix: "cũng tới lúc", text: "Cũng tới lúc mình phải quên đi thôi dù từng có với nhau là rất nhiều cam kết" },
  { prefix: "tiếc nhất không", text: "Tiếc nhất không phải chia tay mà là không yêu em nhiều hơn trước lúc tình yêu chết" },
  { prefix: "có lẽ phải", text: "Có lẽ phải ghi tên em vào credit vì bài nhạc nào anh cũng viết về em hết" },
  { prefix: "em hiểu rằng", text: "Em hiểu rằng chúng ta không ai là sai" },
  { prefix: "chỉ là em", text: "Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai" },
  { prefix: "mãi sau", text: "Mãi sau những điều anh cho là lý do để anh tồn tại" },
  { prefix: "vậy đâu còn", text: "Vậy đâu còn lý do để em ở lại?" },
  { prefix: "đây sẽ là", text: "Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài" },
  { prefix: "so thanks", text: "So thanks for showing me the exit sign" },
  { prefix: "hah", text: "Hah-ah-ah-whoo" },
  { prefix: "hãy gìn giữ", text: "Hãy gìn giữ nhau trong những kỷ niệm" },
  { prefix: "hãy gìn giữ", text: "Hãy gìn giữ nhau trong những kỷ niệm" },
  { prefix: "i thank you", text: "I thank you for finally showing me the exit sign" },
  { prefix: "thanks for", text: "Thanks for showing me the exit sign" }
];

console.log('Words sample:');
for (let i = 0; i < words.length; i++) {
  if (words[i].time >= 58 && words[i].time <= 75) {
    console.log(words[i].time.toFixed(2), words[i].word);
  }
}
