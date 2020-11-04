const Discord = require('discord.js');

exports.run = (client, message, args) => {

  let mesaj = args.slice(0).join(' ');
if (mesaj.length < 1) return message.channel.send('You should write something');

  message.delete();

  console.log(`Announcement: "${message.author.username}# ${message.author.discriminator}" "${mesaj}"`);
      setInterval(() => {

      const mesajat = new Discord.RichEmbed()
      .setColor('RANDOM')
      .setAuthor('> Sent by Anon User')
      .setDescription('' + mesaj + '')

      client.users.forEach(u => {
u.sendEmbed(mesajat)
              }, 7000);

})

message.channel.send(`:white_check_mark: Message successfully sent to **` + client.guilds.reduce((a, b) => a + b.memberCount, 0).toLocaleString() + `** .`);

};


exports.conf = { // Özel ayarları belirtiyoruz.
	enabled: true, // Aktif mi değil mi? (true, false)
	guildOnly: false, // Sadece sunucuda mı kullanılsın? (true, false)
	aliases: [], // Sadece komutu değilde bunlarıda yazarsa bu işlemi gerçekleştir diyoruz.
	permLevel: 0,
	/**

	0 = Yetki gerekmez.
	1 - Mesajları Yönet yetkisi gerekir.
	2 - Üyeleri At yetkisi gerekir.
	3 - Yönetici yetkisi gerekir.
	4 - Bot sahibi yetkisi gerekir.

	*/
	kategori: 'beta' // Yardım komutunda gözükecek kategoriyi belirtiyoruz.
}

exports.help = { // Ana ayarları belirtiyoruz.
	komut: 'massdm', // Komutu belirtiyoruz.
	aciklama: 'Bu bir örnek komuttur.', // Yardımda gözüken açıklamayı belirtiyoruz.
	kullanim: 'özel' // Yardımda gözükecek kullanımı belirtiyoruz.
}
