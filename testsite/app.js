document.getElementById('message').textContent = 'JavaScript is running.';
let clicks = 0;
document.getElementById('counter').addEventListener('click', function () {
  clicks++;
  this.textContent = 'Clicked ' + clicks + ' times';
});
