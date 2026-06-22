import os, json, time, threading
from pathlib import Path
import requests
import telebot
from telebot import types
from flask import Flask

TOKEN = os.getenv('TOKEN') or os.getenv('BOT_TOKEN', '')
ADMIN_ID = int(os.getenv('ADMIN_ID', '0'))
PING_URL = os.getenv('PING_URL', 'https://your-app.onrender.com/')
PING_INTERVAL = 300
DATA_FILE = Path('players.json')
LOCK = threading.Lock()
START_COINS = 1000
WIN_X = 1.3

if not TOKEN:
    raise RuntimeError('Укажи TOKEN или BOT_TOKEN в Render Environment Variables')

bot = telebot.TeleBot(TOKEN, parse_mode='HTML')

GAME_INFO = {
    'basket': {'name':'🏀 Баскетбол','emoji':'🏀','win_values':[4,5],'win_text':'🏀 Попадание!','lose_text':'🏀 Мимо!'},
    'darts': {'name':'🎯 Дартс','emoji':'🎯','win_values':[5,6],'win_text':'🎯 Точно в цель!','lose_text':'🎯 Не попал!'},
    'football': {'name':'⚽ Футбол','emoji':'⚽','win_values':[3,4,5],'win_text':'⚽ ГОООЛ!','lose_text':'⚽ Мимо ворот!'},
    'bowling': {'name':'🎳 Боулинг','emoji':'🎳','win_values':[5,6],'win_text':'🎳 Страйк!','lose_text':'🎳 Неудачный бросок!'},
    'casino': {'name':'🎰 Казино','emoji':'🎰','win_values':[64],'win_text':'🎰 Джекпот!','lose_text':'🎰 Не повезло!'},
}

def fmt(n):
    return f"{int(n):,}".replace(',', "'")

def default_data():
    return {'players': {}, 'stats': {'total_games': 0}}

def load_data():
    if not DATA_FILE.exists():
        return default_data()
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = default_data()
    data.setdefault('players', {})
    data.setdefault('stats', {})
    data['stats'].setdefault('total_games', 0)
    return data

def save_data(data):
    # Чистим мусор: не сохраняем историю каждой игры, только баланс и статистику.
    clean = {'players': {}, 'stats': {'total_games': int(data.get('stats', {}).get('total_games', 0))}}
    for uid, p in data.get('players', {}).items():
        clean['players'][uid] = {
            'username': p.get('username', ''),
            'coins': int(p.get('coins', START_COINS)),
            'wins': int(p.get('wins', 0)),
            'losses': int(p.get('losses', 0)),
            'games': int(p.get('games', 0)),
            'best_balance': int(p.get('best_balance', p.get('coins', START_COINS))),
            'last_bonus': int(p.get('last_bonus', 0)),
            'current_game': p.get('current_game'),
            'current_bet': int(p.get('current_bet', 0)),
        }
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)

def get_player(data, user_id, username=''):
    uid = str(user_id)
    if uid not in data['players']:
        data['players'][uid] = {'username': username or '', 'coins': START_COINS, 'wins': 0, 'losses': 0, 'games': 0, 'best_balance': START_COINS, 'last_bonus': 0, 'current_game': None, 'current_bet': 0}
    p = data['players'][uid]
    p['username'] = username or p.get('username', '')
    for k, v in {'coins': START_COINS, 'wins':0, 'losses':0, 'games':0, 'best_balance':START_COINS, 'last_bonus':0, 'current_game':None, 'current_bet':0}.items():
        p.setdefault(k, v)
    return p

def main_menu():
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row('🎮 Играть', '💰 Баланс')
    kb.row('🏆 Топ', '🎁 Бонус')
    kb.row('📊 Профиль', '❓ Помощь')
    return kb

def games_kb():
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton('🏀 Баскетбол', callback_data='game_basket'))
    kb.add(types.InlineKeyboardButton('🎯 Дартс', callback_data='game_darts'))
    kb.add(types.InlineKeyboardButton('⚽ Футбол', callback_data='game_football'))
    kb.add(types.InlineKeyboardButton('🎳 Боулинг', callback_data='game_bowling'))
    kb.add(types.InlineKeyboardButton('🎰 Казино', callback_data='game_casino'))
    return kb

def bets_kb(game):
    kb = types.InlineKeyboardMarkup()
    kb.row(types.InlineKeyboardButton('100 m¢', callback_data=f'bet_{game}_100'), types.InlineKeyboardButton('300 m¢', callback_data=f'bet_{game}_300'))
    kb.row(types.InlineKeyboardButton('500 m¢', callback_data=f'bet_{game}_500'), types.InlineKeyboardButton('1000 m¢', callback_data=f'bet_{game}_1000'))
    kb.add(types.InlineKeyboardButton('💰 Весь баланс', callback_data=f'bet_{game}_all'))
    kb.add(types.InlineKeyboardButton('⬅️ Назад', callback_data='back_games'))
    return kb

@bot.message_handler(commands=['start'])
def start(m):
    with LOCK:
        data = load_data(); get_player(data, m.from_user.id, m.from_user.username or ''); save_data(data)
    bot.send_message(m.chat.id, "👋 <b>Привет!</b>\n\nДобро пожаловать в <b>MoneyPlay</b> 🎮\n\nЗдесь ты можешь играть в мини-игры, копить m¢ и соревноваться с друзьями.\n\n🏆 Поднимайся в топ\n💰 Копи монеты\n🎲 Проверяй удачу\n🔥 Стань самым богатым игроком\n\n👇 Нажми «🎮 Играть», чтобы начать!", reply_markup=main_menu())

@bot.message_handler(func=lambda m: m.text == '🎮 Играть')
def play(m):
    with LOCK:
        data = load_data(); p = get_player(data, m.from_user.id, m.from_user.username or ''); save_data(data)
    bot.send_message(m.chat.id, f"🎮 <b>ДАВАЙ ИГРАТЬ!</b>\n\n💰 Баланс: <b>{fmt(p['coins'])} m¢</b>\n\n👇 Выбери игру:", reply_markup=games_kb())

@bot.callback_query_handler(func=lambda c: c.data.startswith('game_') or c.data == 'back_games')
def choose_game(c):
    if c.data == 'back_games':
        bot.answer_callback_query(c.id)
        return bot.edit_message_text('🎮 <b>Выбери игру:</b>', c.message.chat.id, c.message.message_id, reply_markup=games_kb())
    game = c.data.replace('game_', '')
    info = GAME_INFO.get(game)
    if not info: return bot.answer_callback_query(c.id, 'Игра не найдена', show_alert=True)
    with LOCK:
        data = load_data(); p = get_player(data, c.from_user.id, c.from_user.username or ''); save_data(data)
    bot.answer_callback_query(c.id)
    bot.edit_message_text(f"{info['name']}\n\n💰 Баланс: <b>{fmt(p['coins'])} m¢</b>\n✅ Победа: x{WIN_X}\n❌ Проигрыш: теряешь ставку\n\n👇 Выбери ставку:", c.message.chat.id, c.message.message_id, reply_markup=bets_kb(game))

@bot.callback_query_handler(func=lambda c: c.data.startswith('bet_'))
def make_bet(c):
    _, game, bet_raw = c.data.split('_')
    info = GAME_INFO.get(game)
    if not info: return bot.answer_callback_query(c.id, 'Игра не найдена', show_alert=True)
    with LOCK:
        data = load_data(); p = get_player(data, c.from_user.id, c.from_user.username or '')
        balance = int(p['coins'])
        if balance <= 0:
            save_data(data); return bot.answer_callback_query(c.id, 'У тебя 0 m¢. Забери бонус 🎁', show_alert=True)
        bet = balance if bet_raw == 'all' else int(bet_raw)
        if bet > balance:
            save_data(data); return bot.answer_callback_query(c.id, 'Не хватает m¢', show_alert=True)
        p['current_game'] = game; p['current_bet'] = bet; save_data(data)
    bot.answer_callback_query(c.id)
    try: bot.edit_message_reply_markup(c.message.chat.id, c.message.message_id, reply_markup=None)
    except Exception: pass
    bot.send_message(c.message.chat.id, f"{info['name']}\n\n💸 Ставка: <b>{fmt(bet)} m¢</b>\n🎲 Бросаем...")
    dice_msg = bot.send_dice(c.message.chat.id, emoji=info['emoji'])
    time.sleep(4)
    is_win = dice_msg.dice.value in info['win_values']
    with LOCK:
        data = load_data(); p = get_player(data, c.from_user.id, c.from_user.username or '')
        bet = min(int(p.get('current_bet', bet)), int(p['coins']))
        if is_win:
            win_amount = int(bet * WIN_X)
            p['coins'] = int(p['coins']) - bet + win_amount
            p['wins'] += 1
            text = f"{info['win_text']}\n\n💸 Ставка: <b>{fmt(bet)} m¢</b>\n🎉 Выигрыш: <b>+{fmt(win_amount)} m¢</b>\n\n💰 Баланс: <b>{fmt(p['coins'])} m¢</b>"
        else:
            p['coins'] = max(0, int(p['coins']) - bet)
            p['losses'] += 1
            text = f"{info['lose_text']}\n\n💸 Ставка: <b>{fmt(bet)} m¢</b>\n📉 Потеряно: <b>{fmt(bet)} m¢</b>\n\n💰 Баланс: <b>{fmt(p['coins'])} m¢</b>"
        p['games'] += 1; p['best_balance'] = max(int(p.get('best_balance',0)), int(p['coins']))
        p['current_game'] = None; p['current_bet'] = 0
        data['stats']['total_games'] = int(data['stats'].get('total_games',0)) + 1
        save_data(data)
    bot.send_message(c.message.chat.id, text, reply_markup=games_kb())

@bot.message_handler(func=lambda m: m.text == '💰 Баланс')
def balance(m):
    with LOCK:
        data = load_data(); p = get_player(data, m.from_user.id, m.from_user.username or ''); save_data(data)
    bot.send_message(m.chat.id, f"💰 <b>Твой баланс:</b> {fmt(p['coins'])} m¢")

@bot.message_handler(func=lambda m: m.text == '📊 Профиль')
def profile(m):
    with LOCK:
        data = load_data(); p = get_player(data, m.from_user.id, m.from_user.username or ''); save_data(data)
    bot.send_message(m.chat.id, f"📊 <b>Профиль игрока</b>\n\n👤 Игрок: @{m.from_user.username or 'без username'}\n🆔 ID: <code>{m.from_user.id}</code>\n\n💰 Баланс: <b>{fmt(p['coins'])} m¢</b>\n🏆 Лучший баланс: <b>{fmt(p['best_balance'])} m¢</b>\n🎮 Игр сыграно: <b>{p['games']}</b>\n✅ Побед: <b>{p['wins']}</b>\n❌ Поражений: <b>{p['losses']}</b>")

@bot.message_handler(func=lambda m: m.text == '🏆 Топ')
def top(m):
    with LOCK:
        data = load_data(); players = [(int(p.get('coins',0)), p.get('username') or f'ID {uid}') for uid,p in data.get('players',{}).items()]
    players.sort(reverse=True, key=lambda x:x[0])
    if not players: return bot.send_message(m.chat.id, '🏆 Топ пока пуст.')
    medals = ['🥇','🥈','🥉']; text = '🏆 <b>Топ богатых игроков</b>\n\n'
    for i,(coins,name) in enumerate(players[:10],1):
        prefix = medals[i-1] if i <= 3 else f'{i}.'
        name = name if name.startswith('ID ') else '@' + name
        text += f"{prefix} {name} — <b>{fmt(coins)} m¢</b>\n"
    bot.send_message(m.chat.id, text)

@bot.message_handler(func=lambda m: m.text == '🎁 Бонус')
def bonus(m):
    now = int(time.time()); cooldown = 86400; reward = 500
    with LOCK:
        data = load_data(); p = get_player(data, m.from_user.id, m.from_user.username or '')
        last = int(p.get('last_bonus',0))
        if now - last < cooldown:
            left = cooldown - (now-last); h = left//3600; mm = (left%3600)//60
            save_data(data); return bot.send_message(m.chat.id, f"⏳ Бонус уже получен.\n\nПриходи через: <b>{h}ч {mm}м</b>")
        p['coins'] += reward; p['last_bonus'] = now; p['best_balance'] = max(p['best_balance'], p['coins']); save_data(data)
    bot.send_message(m.chat.id, f"🎁 <b>Ежедневный бонус получен!</b>\n\n💰 Начислено: <b>{fmt(reward)} m¢</b>\n💰 Баланс: <b>{fmt(p['coins'])} m¢</b>")

@bot.message_handler(func=lambda m: m.text == '❓ Помощь')
def help_msg(m):
    bot.send_message(m.chat.id, f"❓ <b>Помощь</b>\n\n🎮 Играй в мини-игры и копи m¢.\n✅ Победа даёт x{WIN_X} от ставки.\n❌ При проигрыше теряется ставка.\n🎁 Бонус можно получать 1 раз в день.\n\n⚠️ Это игровой бот без выводов и реальных выплат.")

@bot.message_handler(commands=['give'])
def give(m):
    if m.from_user.id != ADMIN_ID: return
    try: _, uid, amount = m.text.split(maxsplit=2); amount = int(amount)
    except Exception: return bot.send_message(m.chat.id, 'Использование: /give user_id сумма')
    with LOCK:
        data = load_data(); p = get_player(data, uid); p['coins'] += amount; p['best_balance'] = max(p['best_balance'], p['coins']); save_data(data)
    bot.send_message(m.chat.id, f'✅ Начислено {fmt(amount)} m¢ пользователю {uid}')

@bot.message_handler(commands=['take'])
def take(m):
    if m.from_user.id != ADMIN_ID: return
    try: _, uid, amount = m.text.split(maxsplit=2); amount = int(amount)
    except Exception: return bot.send_message(m.chat.id, 'Использование: /take user_id сумма')
    with LOCK:
        data = load_data(); p = get_player(data, uid); p['coins'] = max(0, p['coins'] - amount); save_data(data)
    bot.send_message(m.chat.id, f'✅ Списано {fmt(amount)} m¢ у пользователя {uid}')

@bot.message_handler(commands=['stats'])
def admin_stats(m):
    if m.from_user.id != ADMIN_ID: return
    with LOCK:
        data = load_data(); users=len(data['players']); total_games=data['stats'].get('total_games',0); total_coins=sum(int(p.get('coins',0)) for p in data['players'].values())
    bot.send_message(m.chat.id, f"📊 <b>Статистика бота</b>\n\n👥 Игроков: <b>{users}</b>\n🎮 Всего игр: <b>{total_games}</b>\n💰 Монет у игроков: <b>{fmt(total_coins)} m¢</b>")

@bot.message_handler(func=lambda m: True)
def fallback(m):
    bot.send_message(m.chat.id, '👇 Выбери кнопку в меню.', reply_markup=main_menu())

app = Flask(__name__)
@app.route('/')
def home(): return 'MoneyPlay Bot is working ✅'

def run_flask():
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 10000)))

def auto_ping():
    while True:
        try:
            requests.get(PING_URL, timeout=15)
            print(f'✅ Auto ping OK: {PING_URL}')
        except Exception as e:
            print(f'⚠️ Auto ping error: {e}')
        time.sleep(PING_INTERVAL)

if __name__ == '__main__':
    threading.Thread(target=run_flask, daemon=True).start()
    threading.Thread(target=auto_ping, daemon=True).start()
    print('MoneyPlay bot started')
    bot.infinity_polling(skip_pending=True, timeout=60)
