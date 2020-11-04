module.exports = member => {
  let guild = member.guild;
  member.send('niye gittin?');
  guild.defaultChannel.sendMessage(`${member.user.username} gitti.`);
};
