#!/usr/bin/env python3
"""Локальный сервер для веб-версии «Проверь Д/З».

Запуск:  python server.py
Откройте: http://localhost:8000

Сервер отдаёт страницу из папки www и пересылает запросы к нейросетям
(ключ приходит из вашего браузера и нигде не сохраняется):
  /api/deepseek — DeepSeek
  /api/giga     — GigaChat (нужен сертификат Минцифры, см. ниже)

Сертификат Минцифры для GigaChat:
  1) Скачайте корневой и выпускающий сертификаты на gosuslugi.ru/crt (формат PEM),
     вставьте их подряд в один файл и укажите путь:
        Windows (PowerShell):  $env:GIGACHAT_CA="C:\\путь\\russian_ca.crt"
        macOS / Linux:         export GIGACHAT_CA=/путь/russian_ca.crt
  2) Либо только для личной проверки: GIGACHAT_INSECURE=1 python server.py
     (отключает проверку сертификата, не используйте для чужих данных)

Сервер рассчитан только на локальное использование: не открывайте его в интернет.
"""
import base64
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(HERE, "www")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
API = "https://api.deepseek.com/chat/completions"
IMAGE_TYPES = ("image/jpeg", "image/png", "image/gif", "image/webp")

OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
BASE_URL = "https://gigachat.devices.sberbank.ru/api/v1"


def make_ctx():
    if os.environ.get("GIGACHAT_INSECURE") == "1":
        c = ssl.create_default_context()
        c.check_hostname = False
        c.verify_mode = ssl.CERT_NONE
        return c
    ca = os.environ.get("GIGACHAT_CA")
    if ca:
        return ssl.create_default_context(cafile=ca)
    return ssl.create_default_context()


CTX = make_ctx()
TOKENS = {}  # ключ авторизации -> (токен, время истечения)


class GigaError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


def call(url, data=None, headers=None, timeout=120):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        if "CERTIFICATE" in str(e).upper():
            raise GigaError(0, "Не удалось проверить сертификат GigaChat. Установите сертификат НУЦ Минцифры "
                               "и задайте GIGACHAT_CA (см. начало server.py).")
        raise GigaError(0, "Нет связи с GigaChat: " + str(e.reason))
    except TimeoutError:
        raise GigaError(0, "GigaChat слишком долго отвечает. Попробуйте ещё раз.")


def brief(raw):
    try:
        j = json.loads(raw)
        return j.get("message") or j.get("error") or str(j)[:200]
    except Exception:
        return raw[:200].decode("utf-8", "replace") if raw else ""


def get_token(key):
    t = TOKENS.get(key)
    if t and t[1] > time.time() + 60:
        return t[0]
    body = urllib.parse.urlencode({"scope": "GIGACHAT_API_PERS"}).encode()
    st, raw = call(OAUTH_URL, body, {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "RqUID": str(uuid.uuid4()),
        "Authorization": "Basic " + key,
    })
    if st != 200:
        if st in (400, 401, 403):
            raise GigaError(401, "Ключ авторизации не подошёл. Проверьте, что скопировали его целиком. " + brief(raw))
        raise GigaError(st, "Не удалось получить токен GigaChat (код %s). %s" % (st, brief(raw)))
    j = json.loads(raw)
    TOKENS[key] = (j["access_token"], j.get("expires_at", 0) / 1000.0)
    return j["access_token"]


def upload(token, mime, b64):
    ext = {"image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf"}.get(mime, "jpg")
    boundary = uuid.uuid4().hex
    nl = b"\r\n"
    body = (
        b"--" + boundary.encode() + nl +
        b'Content-Disposition: form-data; name="purpose"' + nl + nl + b"general" + nl +
        b"--" + boundary.encode() + nl +
        ('Content-Disposition: form-data; name="file"; filename="work.%s"' % ext).encode() + nl +
        ("Content-Type: %s" % mime).encode() + nl + nl +
        base64.b64decode(b64) + nl +
        b"--" + boundary.encode() + b"--" + nl
    )
    st, raw = call(BASE_URL + "/files", body, {
        "Authorization": "Bearer " + token,
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "Accept": "application/json",
    })
    if st != 200:
        raise GigaError(st, "Не удалось загрузить фото в GigaChat (код %s). %s" % (st, brief(raw)))
    return json.loads(raw)["id"]


def chat(token, model, text, file_id):
    msg = {"role": "user", "content": text}
    payload = {"model": model, "messages": [msg], "temperature": 0.1}
    if file_id:
        msg["attachments"] = [file_id]
        payload["function_call"] = "auto"
    st, raw = call(BASE_URL + "/chat/completions", json.dumps(payload).encode("utf-8"), {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    if st != 200:
        if st == 429:
            raise GigaError(429, "Лимит запросов GigaChat исчерпан. Подождите немного.")
        raise GigaError(st, "Ошибка GigaChat (код %s). %s" % (st, brief(raw)))
    return json.loads(raw)["choices"][0]["message"]["content"]


def handle_giga(data):
    key = (data.get("key") or "").strip()
    if not key:
        raise GigaError(401, "Не указан ключ авторизации GigaChat.")
    token = get_token(key)
    img = data.get("image")
    file_id = upload(token, img["mime"], img["b64"]) if img else None
    return chat(token, data.get("model") or "GigaChat-2-Max", data.get("text") or "", file_id)



class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def reply(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/giga":
            try:
                n = int(self.headers.get("Content-Length", "0"))
                if n <= 0:
                    self.reply(400, {"error": "Пустой запрос."})
                    return
                if n > 48 * 1024 * 1024:
                    self.reply(413, {"error": "Слишком большой запрос (лимит 48 МБ)."})
                    return
                data = json.loads(self.rfile.read(n))
                if not isinstance(data, dict):
                    self.reply(400, {"error": "Некорректный формат запроса."})
                    return
                self.reply(200, {"text": handle_giga(data)})
            except GigaError as e:
                self.reply(200, {"error": e.msg, "status": e.status})
            except (ValueError, json.JSONDecodeError):
                self.reply(400, {"error": "Не удалось прочитать JSON-запрос."})
            except Exception:  # noqa
                self.reply(500, {"error": "Внутренняя ошибка сервера. Повторите попытку."})
            return
        if self.path != "/api/deepseek":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 48 * 1024 * 1024:
                self.reply(413, {"error": "Слишком большой запрос."})
                return
            data = json.loads(self.rfile.read(length))
            key = str(data.get("key", "")).strip()
            if not key:
                self.reply(400, {"error": "Не указан API-ключ DeepSeek."})
                return
            content = [{"type": "text", "text": data.get("text") or "Проанализируй приложенный материал."}]
            media = data.get("media")
            if media:
                mime = media.get("mime", "image/jpeg")
                if mime not in IMAGE_TYPES:
                    self.reply(400, {"error": "Формат файла не поддерживается. Используйте JPG или PNG."})
                    return
                content.append({"type": "image_url",
                                "image_url": {"url": "data:%s;base64,%s" % (mime, media.get("b64", ""))}})
            payload = json.dumps({
                "model": data.get("model") or "deepseek-flash",
                "messages": [{"role": "user", "content": content}],
                "temperature": 0.1,
                "max_tokens": 8192,
            }).encode("utf-8")
            req = urllib.request.Request(API, data=payload, method="POST", headers={
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
            })
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    result = json.loads(resp.read())
            except urllib.error.HTTPError as e:
                try:
                    detail = json.loads(e.read()).get("error", {}).get("message", str(e))
                except Exception:
                    detail = str(e)
                msgs = {401: "DeepSeek отклонил ключ. Проверьте ключ в DeepSeek Platform.",
                        402: "Недостаточно средств на балансе DeepSeek API.",
                        429: "Превышен лимит запросов DeepSeek. Подождите немного."}
                self.reply(e.code, {"error": msgs.get(e.code, detail)})
                return
            except urllib.error.URLError as e:
                self.reply(502, {"error": "Не удалось подключиться к api.deepseek.com: %s" % e.reason})
                return
            answer = (result.get("choices") or [{}])[0].get("message", {}).get("content")
            self.reply(200, {"text": answer} if answer else {"error": "DeepSeek не вернул ответ."})
        except Exception as e:  # noqa
            self.reply(500, {"error": "Внутренняя ошибка: %s" % e})


if __name__ == "__main__":
    print("Готово. Откройте в браузере: http://localhost:%d  (остановить: Ctrl+C)" % PORT)
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
