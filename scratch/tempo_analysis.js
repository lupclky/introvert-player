const fs = require('fs');

const ccLines = [
  { text: 'Anh không nhớ nổi lần cuối cùng anh nhìn vào mắt em đó là từ bao giờ', time: 58.72 },
  { text: 'Em từng trách anh chỉ ôm ước mơ, còn không sợ mất em thì làm sao chờ?', time: 61.28 },
  { text: 'Lúc đó anh có xin lỗi hay không thì kết quả nó cũng như nhau mà', time: 63.32 },
  { text: 'Cuối cùng thì hai ta đều ích kỷ, nông nổi, tự trọng cao mà', time: 67.00 },
  { text: 'Ta từng bắt gặp nhau ở khắp Sài Gòn, chắc là lúc còn yêu thì muốn tránh cũng khó', time: 69.56 },
  { text: 'Không thể tin là mình chưa từng gặp lại sau khi mà anh bước qua cánh cửa đó', time: 74.28 },
  { text: 'Tình yêu mình từng là ánh lửa đỏ, từng là chim sẻ cố đập cánh giữa gió', time: 77.48 },
  { text: 'Cố gắng sống hai cuộc đời, chắc là thằng nhóc này muốn làm thần thánh nữa đó', time: 79.16 },
  { text: 'Sao giờ em xuất hiện tại đây vậy? Cuối hàng khán giả với cánh tay vẫy', time: 82.28 },
  { text: 'Em từng cùng anh đứng ở hậu trường và cùng anh về nhà sau khi mà bay nhảy', time: 86.08 },
  { text: 'Cũng từng nói, "Em không có gạt anh, em thích nhạc anh", and you know the vision', time: 89.28 },
  { text: 'Anh từng hứa là mình không nhạt đâu, sẽ không lạc nhau, cùng bên nhau vào khi cần', time: 92.32 },
  { text: 'Ngay lúc đó anh chỉ muốn lao xuống, anh thật sự tò mò, em dạo này khỏe không?', time: 95.44 },
  { text: 'Nhưng mà sao hôm nay em đi khuya vậy? Ba mẹ em biết là ba mẹ sẽ trông', time: 98.48 },
  { text: 'Anh từng mong em hạnh phúc, tới khi em nở nụ cười, anh như bị đâm mười nhát', time: 100.40 },
  { text: 'Khi anh đứng trên sân khấu một mình, còn em đứng cạnh cùng với một người khác', time: 103.64 },
  { text: 'Em hiểu rằng chúng ta không ai là sai', time: 110.48 },
  { text: 'Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai', time: 113.08 },
  { text: 'Mãi sau những điều anh cho là lý do để anh tồn tại', time: 119.92 },
  { text: 'Vậy đâu còn lý do để em ở lại?', time: 123.92 },
  { text: 'Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài', time: 127.73 },
  { text: 'So thanks for showing me the exit sign', time: 131.32 },
  { text: 'Chưa nói tới đúng sai nhưng chuyến xe dừng lại là do chân anh đặt trên phanh', time: 134.72 },
  { text: 'Anh đã không ngần ngại chia con đường làm hai vì anh nghĩ là anh quên nhanh', time: 138.12 },
  { text: 'Gặp một cô gái mới coi là cả thế giới, viết tên cả hai lên tranh', time: 141.44 },
  { text: 'Không dễ nhiều đêm trắng để chờ lên nắng, giờ thì ký ức gọi tên anh', time: 144.36 },
  { text: 'Nên là cứ rót đi, bàn vẫn ướt mặc dù có lót ly', time: 146.12 },
  { text: 'Ước gì có thể paste nỗi đau này qua chỗ khác, nhưng không, nó nhân lên, nó chỉ copy', time: 148.24 },
  { text: 'Thật khó để nhìn xung quanh khi chỉ trông ngóng vì sao như Tsiolkovsky', time: 151.52 },
  { text: 'Để bây giờ em đi mất, liên kết còn lại tồn tại giữa anh và em là chung một tài khoản Shopee', time: 156.44 },
  { text: 'Gom hết tất cả về em xong rồi thiêu nhanh', time: 160.40 },
  { text: 'Giọng em vang lên trước khi môi em mở, găm thẳng vào anh như là siêu thanh', time: 161.56 },
  { text: 'Không cần phải là người giỏi toán, đủ biết đây không phải đổi ngang', time: 165.08 },
  { text: 'Em chỉ mất đi một thằng thất bại, anh mất đi một người yêu anh', time: 167.84 },
  { text: '8515 lần nói anh yêu em ở trong Mess nếu mà em search', time: 169.88 },
  { text: 'Cũng tới lúc mình phải quên đi thôi dù từng có với nhau là rất nhiều cam kết', time: 174.23 },
  { text: 'Tiếc nhất không phải chia tay mà là không yêu em nhiều hơn trước lúc tình yêu chết', time: 176.68 },
  { text: 'Có lẽ phải ghi tên em vào credit vì bài nhạc nào anh cũng viết về em hết', time: 180.88 },
  { text: 'Em hiểu rằng chúng ta không ai là sai', time: 182.52 },
  { text: 'Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai', time: 184.76 },
  { text: 'Mãi sau những điều anh cho là lý do để anh tồn tại', time: 192.32 },
  { text: 'Vậy đâu còn lý do để em ở lại?', time: 195.88 },
  { text: 'Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài', time: 200.00 },
  { text: 'So thanks for showing me the exit sign', time: 204.64 },
  { text: 'Hah-ah-ah-whoo', time: 211.04 },
  { text: 'Hãy gìn giữ nhau trong những kỷ niệm', time: 224.36 },
  { text: 'Hãy gìn giữ nhau trong những kỷ niệm', time: 235.96 },
  { text: 'I thank you for finally showing me the exit sign', time: 239.60 },
  { text: 'Thanks for showing me the exit sign', time: 241.96 },
];

const studioLines = [
  { text: 'Anh không nhớ nổi lần cuối cùng anh nhìn vào mắt em đó là từ bao giờ', time: 24.61 },
  { text: 'Em từng trách anh chỉ ôm ước mơ, còn không sợ mất em thì làm sao chờ?', time: 27.51 },
  { text: 'Lúc đó anh có xin lỗi hay không thì kết quả nó cũng như nhau mà', time: 30.78 },
  { text: 'Cuối cùng thì hai ta đều ích kỷ, nông nổi, tự trọng cao mà', time: 33.61 },
  { text: 'Ta từng bắt gặp nhau ở khắp Sài Gòn, chắc là lúc còn yêu thì muốn tránh cũng khó', time: 36.75 },
  { text: 'Không thể tin là mình chưa từng gặp lại sau khi mà anh bước qua cánh cửa đó', time: 39.65 },
  { text: 'Tình yêu mình từng là ánh lửa đỏ, từng là chim sẻ cố đập cánh giữa gió', time: 42.95 },
  { text: 'Cố gắng sống hai cuộc đời, chắc là thằng nhóc này muốn làm thần thánh nữa đó', time: 45.95 },
  { text: 'Sao giờ em xuất hiện tại đây vậy? Cuối hàng khán giả với cánh tay vẫy', time: 48.98 },
  { text: 'Em từng cùng anh đứng ở hậu trường và cùng anh về nhà sau khi mà bay nhảy', time: 51.92 },
  { text: 'Cũng từng nói, "Em không có gạt anh, em thích nhạc anh", and you know the vision', time: 54.92 },
  { text: 'Anh từng hứa là mình không nhạt đâu, sẽ không lạc nhau, cùng bên nhau vào khi cần', time: 58.03 },
  { text: 'Ngay lúc đó anh chỉ muốn lao xuống, anh thật sự tò mò, em dạo này khỏe không?', time: 61.08 },
  { text: 'Nhưng mà sao hôm nay em đi khuya vậy? Ba mẹ em biết là ba mẹ sẽ trông', time: 64.04 },
  { text: 'Anh từng mong em hạnh phúc, tới khi em nở nụ cười, anh như bị đâm mười nhát', time: 67.20 },
  { text: 'Khi anh đứng trên sân khấu một mình, còn em đứng cạnh cùng với một người khác', time: 70.22 },
  { text: 'Em hiểu rằng chúng ta không ai là sai', time: 76.13 },
  { text: 'Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai', time: 80.68 },
  { text: 'Mãi sau những điều anh cho là lý do để anh tồn tại', time: 85.27 },
  { text: 'Vậy đâu còn lý do để em ở lại?', time: 90.55 },
  { text: 'Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài', time: 93.79 },
  { text: 'So thanks for showing me the exit sign', time: 98.53 },
  { text: 'Chưa nói tới đúng sai nhưng chuyến xe dừng lại là do chân anh đặt trên phanh', time: 100.57 },
  { text: 'Anh đã không ngần ngại chia con đường làm hai vì anh nghĩ là anh quên nhanh', time: 103.76 },
  { text: 'Gặp một cô gái mới coi là cả thế giới, viết tên cả hai lên tranh', time: 106.75 },
  { text: 'Không dễ nhiều đêm trắng để chờ lên nắng, giờ thì ký ức gọi tên anh', time: 109.53 },
  { text: 'Nên là cứ rót đi, bàn vẫn ướt mặc dù có lót ly', time: 112.35 },
  { text: 'Ước gì có thể paste nỗi đau này qua chỗ khác, nhưng không, nó nhân lên, nó chỉ copy', time: 115.04 },
  { text: 'Thật khó để nhìn xung quanh khi chỉ trông ngóng vì sao như Tsiolkovsky', time: 118.60 },
  { text: 'Để bây giờ em đi mất, liên kết còn lại tồn tại giữa anh và em là chung một tài khoản Shopee', time: 121.66 },
  { text: 'Gom hết tất cả về em xong rồi thiêu nhanh', time: 125.77 },
  { text: 'Giọng em vang lên trước khi môi em mở, găm thẳng vào anh như là siêu thanh', time: 127.71 },
  { text: 'Không cần phải là người giỏi toán, đủ biết đây không phải đổi ngang', time: 131.08 },
  { text: 'Em chỉ mất đi một thằng thất bại, anh mất đi một người yêu anh', time: 133.65 },
  { text: '8515 lần nói anh yêu em ở trong Mess nếu mà em search', time: 137.01 },
  { text: 'Cũng tới lúc mình phải quên đi thôi dù từng có với nhau là rất nhiều cam kết', time: 140.13 },
  { text: 'Tiếc nhất không phải chia tay mà là không yêu em nhiều hơn trước lúc tình yêu chết', time: 143.11 },
  { text: 'Có lẽ phải ghi tên em vào credit vì bài nhạc nào anh cũng viết về em hết', time: 146.07 },
  { text: 'Em hiểu rằng chúng ta không ai là sai', time: 149.09 },
  { text: 'Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai', time: 153.59 },
  { text: 'Mãi sau những điều anh cho là lý do để anh tồn tại', time: 158.19 },
  { text: 'Vậy đâu còn lý do để em ở lại?', time: 163.43 },
  { text: 'Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài', time: 166.73 },
  { text: 'So thanks for showing me the exit sign', time: 171.48 },
  { text: 'Hah-ah-ah-whoo', time: 175.45 },
  { text: 'Hãy gìn giữ nhau trong những kỷ niệm', time: 177.54 },
  { text: 'Hãy gìn giữ nhau trong những kỷ niệm', time: 180.70 },
  { text: 'I thank you for finally showing me the exit sign', time: 191.09 },
  { text: 'Thanks for showing me the exit sign', time: 195.92 },
];

console.log("Analyzing tempo scaling between Studio and Sóng 26 Performance...");

function analyzeSection(name, startIdx, endIdx) {
  const ccStart = ccLines[startIdx].time;
  const ccEnd = ccLines[endIdx].time;
  const ccDuration = ccEnd - ccStart;
  
  const stdStart = studioLines[startIdx].time;
  const stdEnd = studioLines[endIdx].time;
  const stdDuration = stdEnd - stdStart;
  
  const ratio = ccDuration / stdDuration;
  console.log(`[${name}] Duration: Studio ${stdDuration.toFixed(2)}s | CC ${ccDuration.toFixed(2)}s | Ratio: ${ratio.toFixed(4)}`);
  
  return { ccStart, stdStart, ratio };
}

const v1 = analyzeSection("Verse 1", 0, 15);
const c1 = analyzeSection("Chorus 1", 16, 21);
const v2 = analyzeSection("Verse 2", 22, 37);
const c2 = analyzeSection("Chorus 2", 38, 43);

console.log("\nRe-interpolating CC timestamps strictly based on Studio timing and computed ratio...");
const refinedPerf = [];
for (let i = 0; i < studioLines.length; i++) {
  let anchor = null;
  if (i >= 0 && i <= 15) anchor = v1;
  else if (i >= 16 && i <= 21) anchor = c1;
  else if (i >= 22 && i <= 37) anchor = v2;
  else if (i >= 38 && i <= 43) anchor = c2;
  else anchor = c2; // Outro just use C2 ratio
  
  const stdOffset = studioLines[i].time - anchor.stdStart;
  let newTime = anchor.ccStart + (stdOffset * anchor.ratio);
  
  // Adjust anchor if it's off (we know CC Verse 1 start 58.72 is early, it should be ~59.60)
  // Let's print the interpolated vs CC original
  
  refinedPerf.push({ text: ccLines[i].text, time: newTime, orig: ccLines[i].time });
}

for (const line of refinedPerf) {
  const diff = line.time - line.orig;
  console.log(`${line.time.toFixed(2).padStart(6, '0')} (orig ${line.orig.toFixed(2).padStart(6, '0')}, diff ${diff>0?'+':''}${diff.toFixed(2)}) | ${line.text}`);
}
