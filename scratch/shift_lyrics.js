const perfLyrics = `[00:58.72] Anh không nhớ nổi lần cuối cùng anh nhìn vào mắt em đó là từ bao giờ
[01:01.28] Em từng trách anh chỉ ôm ước mơ, còn không sợ mất em thì làm sao chờ?
[01:03.32] Lúc đó anh có xin lỗi hay không thì kết quả nó cũng như nhau mà
[01:07.00] Cuối cùng thì hai ta đều ích kỷ, nông nổi, tự trọng cao mà
[01:09.56] Ta từng bắt gặp nhau ở khắp Sài Gòn, chắc là lúc còn yêu thì muốn tránh cũng khó
[01:14.28] Không thể tin là mình chưa từng gặp lại sau khi mà anh bước qua cánh cửa đó
[01:17.48] Tình yêu mình từng là ánh lửa đỏ, từng là chim sẻ cố đập cánh giữa gió
[01:19.16] Cố gắng sống hai cuộc đời, chắc là thằng nhóc này muốn làm thần thánh nữa đó
[01:22.28] Sao giờ em xuất hiện tại đây vậy? Cuối hàng khán giả với cánh tay vẫy
[01:26.08] Em từng cùng anh đứng ở hậu trường và cùng anh về nhà sau khi mà bay nhảy
[01:29.28] Cũng từng nói, "Em không có gạt anh, em thích nhạc anh", and you know the vision
[01:32.32] Anh từng hứa là mình không nhạt đâu, sẽ không lạc nhau, cùng bên nhau vào khi cần
[01:35.44] Ngay lúc đó anh chỉ muốn lao xuống, anh thật sự tò mò, em dạo này khỏe không?
[01:38.48] Nhưng mà sao hôm nay em đi khuya vậy? Ba mẹ em biết là ba mẹ sẽ trông
[01:40.40] Anh từng mong em hạnh phúc, tới khi em nở nụ cười, anh như bị đâm mười nhát
[01:43.64] Khi anh đứng trên sân khấu một mình, còn em đứng cạnh cùng với một người khác
[01:50.48] Em hiểu rằng chúng ta không ai là sai
[01:53.08] Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai
[01:59.92] Mãi sau những điều anh cho là lý do để anh tồn tại
[02:03.92] Vậy đâu còn lý do để em ở lại?
[02:07.73] Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài
[02:11.32] So thanks for showing me the exit sign
[02:14.72] Chưa nói tới đúng sai nhưng chuyến xe dừng lại là do chân anh đặt trên phanh
[02:18.12] Anh đã không ngần ngại chia con đường làm hai vì anh nghĩ là anh quên nhanh
[02:21.44] Gặp một cô gái mới coi là cả thế giới, viết tên cả hai lên tranh
[02:24.36] Không dễ nhiều đêm trắng để chờ lên nắng, giờ thì ký ức gọi tên anh
[02:26.12] Nên là cứ rót đi, bàn vẫn ướt mặc dù có lót ly
[02:28.24] Ước gì có thể paste nỗi đau này qua chỗ khác, nhưng không, nó nhân lên, nó chỉ copy
[02:31.52] Thật khó để nhìn xung quanh khi chỉ trông ngóng vì sao như Tsiolkovsky
[02:36.44] Để bây giờ em đi mất, liên kết còn lại tồn tại giữa anh và em là chung một tài khoản Shopee
[02:40.40] Gom hết tất cả về em xong rồi thiêu nhanh
[02:41.56] Giọng em vang lên trước khi môi em mở, găm thẳng vào anh như là siêu thanh
[02:45.08] Không cần phải là người giỏi toán, đủ biết đây không phải đổi ngang
[02:47.84] Em chỉ mất đi một thằng thất bại, anh mất đi một người yêu anh
[02:49.88] 8515 lần nói anh yêu em ở trong Mess nếu mà em search
[02:54.23] Cũng tới lúc mình phải quên đi thôi dù từng có với nhau là rất nhiều cam kết
[02:56.68] Tiếc nhất không phải chia tay mà là không yêu em nhiều hơn trước lúc tình yêu chết
[03:00.88] Có lẽ phải ghi tên em vào credit vì bài nhạc nào anh cũng viết về em hết
[03:02.52] Em hiểu rằng chúng ta không ai là sai
[03:04.76] Chỉ là em không muốn em mãi sẽ là lựa chọn thứ hai
[03:12.32] Mãi sau những điều anh cho là lý do để anh tồn tại
[03:15.88] Vậy đâu còn lý do để em ở lại?
[03:20.00] Đây sẽ là lý do em sẽ thôi đắn đo, cứ ôm mộng hoài
[03:24.64] So thanks for showing me the exit sign
[03:31.04] Hah-ah-ah-whoo
[03:44.36] Hãy gìn giữ nhau trong những kỷ niệm
[03:55.96] Hãy gìn giữ nhau trong những kỷ niệm
[03:59.60] I thank you for finally showing me the exit sign
[04:01.96] Thanks for showing me the exit sign`;

function shiftLrc(lrc, offsetSeconds) {
  return lrc.split('\n').map(line => {
    const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2})\]\s+(.+)$/);
    if (!match) return line;
    const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
    const shifted = time + offsetSeconds;
    const m = Math.floor(shifted / 60).toString().padStart(2, '0');
    const s = (shifted % 60).toFixed(2).padStart(5, '0');
    return `[${m}:${s}] ${match[3]}`;
  }).join('\n');
}

console.log(shiftLrc(perfLyrics, 1.36));
