
const express = require("express");
const app = express();
app.use((req, res) => {
  res.redirect("http://discord.js.org")
})
app.listen(3000);

const Discord = require('discord.js')
const client = new Discord.Client()
require('./util/eventLoader')(client);


client.ayarlar = {

	prefix: "!", // Ön-ek
	token: "TOKEN", //TOKEN
	klasor: "komutlar", // Komutların bulunduğu klasörün ismi
	renk: "RANDOM", // Embed rengi (HTML kodu veya RANDOM yazılabilir.)
	destek: "discord.gg/discord", // Discord destek sunucunuz
	surum: "2.0.1", // Botunuzun sürümü
	site: "site.com", // Botunuzun web sitesi
	yardimcilar: ["1. yardımcı ID numarası", "2. yardımcı ID numarası", "3. yardımcı ID numarası"], // İstenirse daha fazla eklenebilir. Eğer yoksa [] içi temizlenebilir.
	sunucuekleme: "{sunucu} adlı sunucuya eklendim! Bu sunucuda toplam {uye} üye, {bot} bulunuyor! Şuan da toplam {sunucular} tane sunucuya hizmet veriyorum!", // Bot bir sunucuya katılınca konsolda yazacak yazı
	sunucuatma: "{sunucu} adlı sunucudan atıldım! Bu sunucuda toplam {uye} üye, {bot} bulunuyordu! Şuan da toplam {sunucular} tane sunucuya hizmet veriyorum!", // Bot bir sunucudan atılınca konsolda yazacak yazı
}



client.commands = new Discord.Collection()
client.aliases = new Discord.Collection()

const fs = require('fs')
const chalk = require('chalk')

fs.readdir(`./${client.ayarlar.klasor}/`, (err, files) => {
	let jsfiles = files.filter(f => f.split(".").pop() === "js")

	if(jsfiles.length <= 0) {
		console.log(`${chalk.redBright("Üzgünüm ama hiçbir komut bulunamadı!")}`)
	} else {
		if (err) {
			console.error(`${chalk.redBright("Hata çıktı;")}\n${err}\n\n${chalk.greenBright("Hatayı düzeltmen için bir kaç tavsiye vereceğim. İlk öncelikle ayarları doğru girdiğinden ve boş bırakmadığından emin ol. Daha sonra kendin eklediğin komutlara iyice bak ve örnek komutla karşılaştır. Hatan varsa düzelt. Eğer kodda hata olduğunu düşünüyorsan bildirmekten çekinme!")}`)
		}
		console.log(`${chalk.yellow(jsfiles.length)} komut yüklenecek.`)

		jsfiles.forEach(f => {
			let props = require(`./${client.ayarlar.klasor}/${f}`)
			client.commands.set(props.help.komut, props)
			props.conf.aliases.forEach(alias => {
				client.aliases.set(alias, props.help.komut)
			})
			console.log(`Yüklenen komut: ${props.help.komut}`)
		})
	}
})

client.on("ready", () => {
	var odurumlar = ["oynuyor", "dinliyor", "izliyor"]
	var odurum = "PLAYING"

	if(odurumlar.includes(client.ayarlar.oyundurum)) {
		var odurum = client.ayarlar.oyundurum.replace("oynuyor", "PLAYING").replace("dinliyor", "LISTENING").replace("izliyor", "WATCHING")
	}

	var durumlar = ["rahatsizetmeyin", "cevrimici", "bosta"]
	var durum = "dnd"

	if(durumlar.includes(client.ayarlar.durum)) {
		var durum = client.ayarlar.oyundurum.replace("rahatsizetmeyin", "dnd").replace("cevrimici", "online").replace("bosta", "idle")
	}


	console.log(`All commands has been load. Bot successfully joined!`)
})

client.on("guildCreate", guild => {
	console.log(client.ayarlar.sunucuekleme.replace(/{sunucu}/g, chalk.yellow(guild.name)).replace(/{bot}/g, chalk.blue(guild.members.filter(m => m.user.bot).size)).replace(/{uye}/g, chalk.green(guild.members.filter(m => !m.user.bot).size)).replace(/{sunucular}/g, chalk.redBright(client.guilds.size)))
	var odurumlar = ["oynuyor", "dinliyor", "izliyor"]
	var odurum = "PLAYING"

	if(odurumlar.includes(client.ayarlar.oyundurum)) {
		var odurum = client.ayarlar.oyundurum.replace("oynuyor", "PLAYING").replace("dinliyor", "LISTENING").replace("izliyor", "WATCHING")
	}

	var durumlar = ["rahatsizetmeyin", "cevrimici", "bosta"]
	var durum = "dnd"

	if(durumlar.includes(client.ayarlar.durum)) {
		var durum = client.ayarlar.oyundurum.replace("rahatsizetmeyin", "dnd").replace("cevrimici", "online").replace("bosta", "idle")
	}

	client.user.setPresence({
		game: {
			name: client.ayarlar.oyun.replace(/{prefix}/g, client.ayarlar.prefix).replace(/{kullanıcı}/g, client.users.size).replace(/{sunucu}/g, client.guilds.size).replace(/{site}/g, client.ayarlar.site),
			type: odurum
		},
		status: durum
	})
})

client.on("guildDelete", guild => {
	console.log(client.ayarlar.sunucuatma.replace(/{sunucu}/g, chalk.yellow(guild.name)).replace(/{bot}/g, chalk.blue(guild.members.filter(m => m.user.bot).size)).replace(/{uye}/g, chalk.green(guild.members.filter(m => !m.user.bot).size)).replace(/{sunucular}/g, chalk.redBright(client.guilds.size)))
	var odurumlar = ["oynuyor", "dinliyor", "izliyor"]
	var odurum = "PLAYING"

	if(odurumlar.includes(client.ayarlar.oyundurum)) {
		var odurum = client.ayarlar.oyundurum.replace("oynuyor", "PLAYING").replace("dinliyor", "LISTENING").replace("izliyor", "WATCHING")
	}

	var durumlar = ["rahatsizetmeyin", "cevrimici", "bosta"]
	var durum = "dnd"

	if(durumlar.includes(client.ayarlar.durum)) {
		var durum = client.ayarlar.oyundurum.replace("rahatsizetmeyin", "dnd").replace("cevrimici", "online").replace("bosta", "idle")
	}

	client.user.setPresence({
		game: {
			name: client.ayarlar.oyun.replace(/{prefix}/g, client.ayarlar.prefix).replace(/{kullanıcı}/g, client.users.size).replace(/{sunucu}/g, client.guilds.size).replace(/{site}/g, client.ayarlar.site),
			type: odurum
		},
		status: durum
	})
})

client.on("message", async message => {
	if (message.author.bot) return
	if (!message.content.startsWith(client.ayarlar.prefix)) return
	var command = message.content.split(' ')[0].slice(client.ayarlar.prefix.length)
	var args = message.content.split(' ').slice(1)
	var cmd = ''

	if (client.commands.has(command)) {
		var cmd = client.commands.get(command)
	} else if (client.aliases.has(command)) {
		var cmd = client.commands.get(client.aliases.get(command))
	}

	if (cmd) {
		if (cmd.conf.permLevel === 1) {
			if (!message.member.hasPermission("MANAGE_MESSAGES")) {
				const embed = new Discord.RichEmbed()
					.setDescription(`You do not have permission to use this command! ${client.ayarlar.prefix}help' you can write  ${cmd.help.komut} and see what permission you need!`)
					.setColor(client.ayarlar.renk)
					.setTimestamp()
				message.channel.send({embed})
				return
			}
		}
		if (cmd.conf.permLevel === 2) {
			if (!message.member.hasPermission("KICK_MEMBERS")) {
				const embed = new Discord.RichEmbed()
					.setDescription(`You do not have permission to use this command! ${client.ayarlar.prefix}help' you can write  ${cmd.help.komut} and see what permission you need!`)
					.setColor(client.ayarlar.renk)
					.setTimestamp()
				message.channel.send({embed})
				return
			}
		}
		if (cmd.conf.permLevel === 3) {
			if (!message.member.hasPermission("ADMINISTRATOR")) {
				const embed = new Discord.RichEmbed()
					.setDescription(`You do not have permission to use this command! ${client.ayarlar.prefix}help' you can write  ${cmd.help.komut} and see what permission you need!`)
					.setColor(client.ayarlar.renk)
					.setTimestamp()
				message.channel.send({embed})
				return
			}
		}
		if (cmd.conf.permLevel === 4) {
			const x = await client.fetchApplication()
			if (x.owner.id !== message.author.id) {
				const embed = new Discord.RichEmbed()
					.setDescription(`You do not have permission to use this command! ${client.ayarlar.prefix}help' you can write  ${cmd.help.komut} and see what permission you need!`)
					.setColor(client.ayarlar.renk)
					.setTimestamp()
				message.channel.send({embed})
				return
			}
		}
		if (cmd.conf.enabled === false) {
			const embed = new Discord.RichEmbed()
				.setDescription(`This command has been disabled!`)
				.setColor(client.ayarlar.renk)
				.setTimestamp()
			message.channel.send({embed})
			return
		}
		if(message.channel.type === "dm") {
			if (cmd.conf.guildOnly === true) {
				const embed = new Discord.RichEmbed()
					.setDescription(`This command has been disabled for private messages!`)
					.setColor(client.ayarlar.renk)
					.setTimestamp()
				message.channel.send({embed})
				return
			}
		}
		cmd.run(client, message, args)
	}
})

client.login(client.ayarlar.token)

