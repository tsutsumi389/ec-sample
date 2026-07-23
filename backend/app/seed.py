from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import (
    CartItem,
    Category,
    Coupon,
    Experiment,
    ExperimentVariant,
    Order,
    OrderItem,
    Product,
    ProductImage,
    ProductView,
    Review,
    User,
    WishlistItem,
)


def _product_image(slug: str) -> str:
    """frontend/public/products/ 配下のブランド統一SVGイラストを返す。

    フロントと同一オリジンで配信されるため相対パスで指定する。
    外部ストック写真（picsum 等）はトーン不統一のため使用しない。
    """
    return f"/products/{slug}.svg"


# 各商品に sku を付与。sale_price / status / gallery は任意（未指定時は
# それぞれ「なし」「on_sale」「メイン画像のみ」として扱う）。
# gallery はギャラリー表示のデモ用に既存 SVG を流用したプレースホルダ。
#
# description は「商品説明」であると同時に **埋め込みの原文** でもある
# （services/embedding.py の build_product_text が 商品名/カテゴリ/説明/価格帯 を
# 連結してベクトル化する）。「高品質な〇〇です」のようなテンプレ文を並べると全商品の
# ベクトルが近距離に密集し、セマンティック検索のフィルタもホームのレーン分離も効かなく
# なる（config.py の OLLAMA_EMBED_MODEL のコメント参照。過去にモデル側で踏んだのと
# 同じ失敗をデータ側で再現しないこと）。用途・素材・シーン・サイズなど、その商品にしか
# 出てこない具体語を必ず入れる。
#
# image_slug は frontend/public/products/ にある 10 枚の SVG のいずれかを指す。
# 新規 SVG は追加せず、意味的に最も近い 1 枚を流用する（電気ポット系→electric-kettle、
# 革小物→wrist-watch、容器→stainless-bottle、布・マット類→yoga-mat など）。
SEED_PRODUCTS = [
    {
        "name": "ワイヤレスイヤホン",
        "slug": "wireless-earphone",
        "sku": "EAR-2024-001",
        "description": "周囲の騒音をしっかり抑えるノイズキャンセリング機能を搭載した、高音質ワイヤレスイヤホン。ケース込みで最大24時間再生でき、通勤や在宅ワークでも一日中バッテリーを気にせず使えます。IPX4の生活防水に対応し、片耳わずか4.5gの軽さで長時間つけても疲れにくい設計です。",
        "price": 8980,
        "sale_price": 6980,
        "stock": 45,
        "gallery": ["mobile-battery", "bluetooth-speaker"],
    },
    {
        "name": "コーヒーメーカー",
        "slug": "coffee-maker",
        "sku": "KIT-2024-002",
        "description": "豆から挽けるミル内蔵の全自動ドリップ式コーヒーメーカー。挽き目と濃さを好みに合わせて調整でき、朝のタイマー予約にも対応します。ガラスサーバーは最大5杯分。ミル部分は取り外して丸洗いできるので、毎日のお手入れも簡単です。挽きたての香りを、自宅で手軽に楽しめます。",
        "price": 12800,
        "stock": 20,
        "gallery": ["electric-kettle", "stainless-bottle"],
    },
    {"name": "電気ケトル", "slug": "electric-kettle", "sku": "KIT-2024-003", "description": "1Lの大容量で素早く沸騰する電気ケトルです。", "price": 3480, "stock": 60},
    {"name": "モバイルバッテリー", "slug": "mobile-battery", "sku": "ELC-2024-004", "description": "大容量20000mAhでスマホを約5回充電可能。", "price": 2980, "stock": 80},
    {"name": "折りたたみ傘", "slug": "folding-umbrella", "sku": "DLY-2024-005", "description": "軽量で持ち運びやすい自動開閉式の折りたたみ傘。", "price": 1980, "stock": 100},
    {"name": "デスクライト", "slug": "desk-light", "sku": "ELC-2024-006", "description": "目に優しいLEDデスクライト。調光・調色機能付き。", "price": 4500, "stock": 35, "status": "suspended"},
    {"name": "ヨガマット", "slug": "yoga-mat", "sku": "OUT-2024-007", "description": "滑りにくい厚手のヨガマット。収納バッグ付き。", "price": 2500, "stock": 50},
    {"name": "ステンレスボトル", "slug": "stainless-bottle", "sku": "DLY-2024-008", "description": "保温保冷に優れた真空断熱ステンレスボトル 500ml。", "price": 1500, "stock": 90},
    {"name": "ブルートゥーススピーカー", "slug": "bluetooth-speaker", "sku": "ELC-2024-009", "description": "防水仕様のポータブルBluetoothスピーカー。", "price": 6980, "sale_price": 5480, "stock": 30},
    {"name": "腕時計", "slug": "wrist-watch", "sku": "FSN-2024-010", "description": "シンプルで上品なデザインのクオーツ腕時計。", "price": 15800, "stock": 0},
    {"name": "スマートウォッチ", "slug": "smart-watch", "sku": "FSN-2024-011", "description": "健康管理機能を搭載した次世代スマートウォッチ。近日発売予定。", "price": 19800, "stock": 30, "status": "coming_soon", "image_slug": "wrist-watch"},
    # ---- キッチン家電 ----
    {
        "name": "電気圧力鍋",
        "slug": "electric-pressure-cooker",
        "sku": "KIT-2024-012",
        "description": "圧力調理・無水調理・低温調理をひとつでこなす3Lの電気圧力鍋。角煮やカレーの下ごしらえを鍋任せにでき、材料を入れてボタンを押すだけで火加減の見張りが要りません。内鍋はフッ素加工で焦げ付きにくく、シチューの後もスポンジでするりと落ちます。豆や玄米も短時間で芯までやわらかく仕上がります。",
        "price": 16800,
        "sale_price": 13800,
        "stock": 18,
        "image_slug": "electric-kettle",
        "gallery": ["coffee-maker"],
    },
    {
        "name": "ハンドブレンダー",
        "slug": "hand-blender",
        "sku": "KIT-2024-013",
        "description": "鍋に直接差し込んで使えるスティック型のハンドブレンダー。ポタージュやスムージーはもちろん、付属のチョッパーで玉ねぎのみじん切り、泡立て器でメレンゲまで1本でこなします。シャフトは取り外して丸洗いでき、離乳食作りにも安心。握りやすい細身のグリップで、片手が塞がる調理中でも扱いやすい設計です。",
        "price": 5480,
        "stock": 40,
        "image_slug": "electric-kettle",
    },
    {
        "name": "オーブントースター",
        "slug": "oven-toaster",
        "sku": "KIT-2024-014",
        "description": "庫内の温度を80〜230℃で細かく設定できる4枚焼きのオーブントースター。食パンの表面だけを一気に焼き上げて中の水分を逃さず、外はサクッと中はもっちりに仕上がります。グラタンや冷凍ピザも天板ごと調理でき、朝食から夜食まで守備範囲の広い一台。パンくずトレイは引き出して洗えます。",
        "price": 8800,
        "sale_price": 6980,
        "stock": 25,
        "image_slug": "coffee-maker",
    },
    {
        "name": "炊飯器",
        "slug": "rice-cooker",
        "sku": "KIT-2024-015",
        "description": "銘柄ごとに炊き分けるIH式の5.5合炊飯器。かため・やわらかめの食感調整に加え、玄米・雑穀米・おかゆの専用モードを備えています。内釜は厚みのある多層構造で熱がむらなく回り、粒が立ったつやのあるごはんに。保温は24時間まで黄ばみを抑え、朝炊いたごはんが夜でもおいしく食べられます。",
        "price": 19800,
        "stock": 22,
        "image_slug": "electric-kettle",
    },
    {
        "name": "電動コーヒーミル",
        "slug": "coffee-grinder",
        "sku": "KIT-2024-016",
        "description": "エスプレッソからフレンチプレスまで、40段階で挽き目を選べるコニカル刃の電動コーヒーミル。刃が豆を切るように砕くため摩擦熱が起きにくく、香りの飛びを最小限に抑えます。杯数ダイヤルを回せば必要な分だけ自動で挽き止まり、静電気を抑える受け容器で粉の飛び散りもありません。",
        "price": 6980,
        "stock": 35,
        "image_slug": "coffee-maker",
        "gallery": ["electric-kettle"],
    },
    {
        "name": "ホットサンドメーカー",
        "slug": "hot-sandwich-maker",
        "sku": "KIT-2024-017",
        "description": "耳まで圧着してプレスできる直火式のホットサンドメーカー。ガスコンロでもキャンプの焚き火でも使え、両面をこんがり焼けば具がこぼれません。プレートは上下に分割できるので、ミニフライパンとして目玉焼きを焼くこともできます。中央の仕切りで焼き上がりを半分に切り分けられます。",
        "price": 3980,
        "stock": 45,
        "image_slug": "coffee-maker",
    },
    {
        "name": "卓上IHクッキングヒーター",
        "slug": "ih-cooking-heater",
        "sku": "KIT-2024-018",
        "description": "火を使わず1400Wで加熱できる薄型の卓上IHクッキングヒーター。鍋物や焼肉をテーブルの真ん中で楽しめ、揚げ物のときは油温を160〜200℃で自動キープします。天板はフラットなガラストップで、吹きこぼれても布巾でひと拭き。切り忘れ防止と鍋なし検知を備えています。",
        "price": 7980,
        "stock": 30,
        "image_slug": "electric-kettle",
    },
    {
        "name": "フードプロセッサー",
        "slug": "food-processor",
        "sku": "KIT-2024-019",
        "description": "みじん切り・すりおろし・こねるを一台で担う1Lのフードプロセッサー。ハンバーグのタネはボタン数秒、パン生地やうどんのこね作業も刃を替えるだけでこなします。大根おろしは粗さを選べ、繊維をつぶさずみずみずしく仕上がります。容器と刃はすべて食洗機に対応します。",
        "price": 9800,
        "stock": 20,
        "image_slug": "electric-kettle",
    },
    {
        "name": "電気蒸し器",
        "slug": "food-steamer",
        "sku": "KIT-2024-020",
        "description": "2段のかごで野菜と点心を同時に蒸せる電気蒸し器。水を張ってタイマーを回すだけで、ブロッコリーや根菜の甘みを逃さずふっくら火が通ります。蒸し上がると自動で電源が切れる空焚き防止つき。かごは重ねて収納でき、シュウマイや茶碗蒸しの下ごしらえにも便利です。",
        "price": 5980,
        "stock": 15,
        "status": "draft",
        "image_slug": "electric-kettle",
    },
    {
        "name": "温度調整ドリップケトル",
        "slug": "gooseneck-kettle",
        "sku": "KIT-2024-021",
        "description": "1℃刻みで湯温を設定できる細口のグースネックケトル。ハンドドリップで狙った場所に細く長く注げ、ペーパーの縁を濡らさずに蒸らせます。60℃の玉露から96℃の深煎りまで温度を保持でき、湯を沸かし直す手間がありません。ハンドルは熱の伝わりにくい樹脂製です。",
        "price": 11800,
        "stock": 28,
        "image_slug": "electric-kettle",
        "gallery": ["coffee-maker"],
    },
    # ---- 生活家電 ----
    {
        "name": "空気清浄機",
        "slug": "air-purifier",
        "sku": "ELC-2024-022",
        "description": "HEPAフィルターで花粉やハウスダストを捕らえる18畳対応の空気清浄機。ほこりセンサーが空気の汚れを検知して自動で風量を切り替え、就寝時は運転音20dBの静音モードに落ちます。脱臭フィルターが料理やペットのにおいも吸着。フィルター交換の目安はランプで知らせます。",
        "price": 24800,
        "sale_price": 19800,
        "stock": 16,
        "image_slug": "bluetooth-speaker",
    },
    {
        "name": "サーキュレーター",
        "slug": "circulator-fan",
        "sku": "ELC-2024-023",
        "description": "直進性の高い渦巻き状の気流で部屋の空気をかき混ぜるサーキュレーター。エアコンと併用すれば足元にたまった冷気を天井まで循環させ、設定温度を下げすぎずに済みます。上下左右の首振りと風量5段階に対応し、洗濯物の部屋干しにも力を発揮。分解して羽根を水洗いできます。",
        "price": 6480,
        "sale_price": 4980,
        "stock": 38,
        "image_slug": "bluetooth-speaker",
    },
    {
        "name": "衣類スチーマー",
        "slug": "garment-steamer",
        "sku": "ELC-2024-024",
        "description": "ハンガーにかけたまま蒸気を当ててシワを伸ばす衣類スチーマー。立ち上がり25秒で、出かける前のシャツの襟元やスカートの折り目にすぐ使えます。ウールやニットなど当て布が必要な生地も傷めず、たばこや汗のにおいも蒸気で軽減。プレート面を使えばアイロンがけもこなす2WAY仕様です。",
        "price": 7480,
        "stock": 32,
        "image_slug": "electric-kettle",
    },
    {
        "name": "ロボット掃除機",
        "slug": "robot-cleaner",
        "sku": "ELC-2024-025",
        "description": "部屋の間取りをレーザーで測って地図を作り、無駄なく走るロボット掃除機。段差や家具の脚をよけながらフローリングの溝のほこりまで吸い上げ、水拭きモードでは皮脂汚れも拭き取ります。進入禁止エリアをアプリで指定でき、ペットの水皿まわりだけ避けることも可能です。",
        "price": 39800,
        "stock": 12,
        "status": "coming_soon",
        "image_slug": "bluetooth-speaker",
    },
    {
        "name": "加湿器",
        "slug": "humidifier",
        "sku": "ELC-2024-026",
        "description": "超音波とヒーターを組み合わせたハイブリッド式の4L加湿器。目標湿度を50%に設定しておけば湿度センサーが自動で霧の量を調整し、窓の結露を抑えながら喉の乾燥を防ぎます。給水は上から注ぐだけでタンクを外す必要がなく、内部は分解して丸洗いできる衛生設計です。",
        "price": 8980,
        "stock": 0,
        "image_slug": "electric-kettle",
    },
    {
        "name": "電気毛布",
        "slug": "electric-blanket",
        "sku": "ELC-2024-027",
        "description": "洗える生地に細いヒーター線を編み込んだ188×130cmの電気敷き毛布。就寝1時間前にスイッチを入れておけば、布団に入った瞬間から足先までじんわり温まります。ダニ退治モードと室温センサーによる自動温度調整を搭載し、1時間あたりの電気代は約1円。丸めて洗濯機で洗えます。",
        "price": 5480,
        "stock": 40,
        "image_slug": "yoga-mat",
    },
    {
        "name": "USB充電ステーション",
        "slug": "usb-charging-station",
        "sku": "ELC-2024-028",
        "description": "USB-C×4とUSB-A×2を備えた100W出力の充電ステーション。ノートPC・タブレット・スマホ・イヤホンを1つのコンセントでまとめて充電でき、机まわりのACアダプタの山を片付けられます。接続機器に応じて電力を自動配分し、過電流・過熱を検知して止める保護回路つきです。",
        "price": 4980,
        "stock": 50,
        "image_slug": "mobile-battery",
    },
    {
        "name": "骨伝導ヘッドホン",
        "slug": "bone-conduction-headphone",
        "sku": "ELC-2024-029",
        "description": "こめかみに振動を伝えて音を届ける、耳をふさがない骨伝導ヘッドホン。ランニング中も車の接近音や信号の音が聞こえ、在宅ワークでは家族の呼びかけに気づけます。IP67の防水防塵で汗や雨に強く、8時間連続再生。首の後ろを回すチタンバンドは眼鏡と干渉しにくい形状です。",
        "price": 14800,
        "stock": 26,
        "image_slug": "wireless-earphone",
        "gallery": ["bluetooth-speaker"],
    },
    # ---- 日用品 ----
    {
        "name": "保温タンブラー",
        "slug": "insulated-tumbler",
        "sku": "DLY-2024-030",
        "description": "フタつきで真空断熱の350mlタンブラー。淹れたてのコーヒーを6時間温かいまま保ち、氷を入れたアイスティーは結露せずデスクの書類を濡らしません。口当たりの薄い飲み口とスライド式のフタで、作業中に倒しても中身がこぼれにくい設計。ほとんどのドリンクホルダーに収まります。",
        "price": 2480,
        "sale_price": 1880,
        "stock": 70,
        "image_slug": "stainless-bottle",
    },
    {
        "name": "珪藻土バスマット",
        "slug": "diatomite-bath-mat",
        "sku": "DLY-2024-031",
        "description": "足を乗せた瞬間に水滴を吸い込む珪藻土のバスマット。洗濯も天日干しも不要で、使い終わったら立てかけておくだけで自然に乾きます。表面が滑らかになってきたら付属のやすりで削れば吸水力が戻り、家族が続けて入浴してもさらりとした感触が続きます。カビや生乾きのにおいとも無縁です。",
        "price": 3980,
        "stock": 42,
        "image_slug": "yoga-mat",
    },
    {
        "name": "洗濯ネットセット",
        "slug": "laundry-net-set",
        "sku": "DLY-2024-032",
        "description": "目の細かさを変えた大小5枚組の洗濯ネット。ニットやブラウスは粗めの角型、ストッキングや下着は細目の円筒型と、生地の傷みやすさに合わせて使い分けられます。ファスナーは引き手が内側に隠れる仕様で、ドラム式の回転中に他の衣類を引っかけません。",
        "price": 1280,
        "stock": 0,
        "status": "archived",
        "image_slug": "yoga-mat",
    },
    {
        "name": "アロマディフューザー",
        "slug": "aroma-diffuser",
        "sku": "DLY-2024-033",
        "description": "水を使わずエッセンシャルオイルを霧状に噴射するネブライザー式のアロマディフューザー。オイル本来の香りが薄まらずに広がり、玄関やリビングに一滴で香りの層をつくります。噴霧の間隔と濃度を段階で選べ、間欠運転なら1本のオイルが長持ち。運転音は静かで寝室でも使えます。",
        "price": 4280,
        "stock": 36,
        "image_slug": "electric-kettle",
    },
    {
        "name": "長傘",
        "slug": "long-umbrella",
        "sku": "DLY-2024-034",
        "description": "直径68cmの大きな傘面で肩まで覆うグラスファイバー骨のジャンプ傘。16本骨が風を受け流し、裏返っても骨組みが折れずに元へ戻ります。手元は握りやすいウッド調で、玄関に立てかけても倒れにくい形状。撥水加工は数回振るだけで水滴が落ち、電車に乗る前の水切りが楽です。",
        "price": 3480,
        "stock": 55,
        "image_slug": "folding-umbrella",
    },
    {
        "name": "レインポンチョ",
        "slug": "rain-poncho",
        "sku": "DLY-2024-035",
        "description": "リュックを背負ったまますっぽりかぶれる耐水圧5000mmのレインポンチョ。自転車通勤ではハンドルまで裾が届き、野外フェスでは敷物代わりにも広げられます。脇下のベンチレーションが蒸れを逃がし、たたむと手のひらサイズの収納袋に。フードのつばが顔に雨が吹き込むのを防ぎます。",
        "price": 2980,
        "stock": 48,
        "image_slug": "folding-umbrella",
    },
    {
        "name": "竹製まな板",
        "slug": "bamboo-cutting-board",
        "sku": "DLY-2024-036",
        "description": "刃当たりがやわらかく包丁を傷めにくい孟宗竹のまな板。密度が高いため水を吸いにくく、生魚を切った後もにおいが残りにくいのが特長です。反り止めの溝が入っており、洗って立てかけても歪みません。片面には肉汁を受ける溝があり、ローストの切り分けにも使えます。",
        "price": 2680,
        "stock": 8,
        "status": "discontinued",
        "image_slug": "yoga-mat",
    },
    {
        "name": "密閉ガラス保存容器",
        "slug": "glass-food-container",
        "sku": "DLY-2024-037",
        "description": "耐熱ガラス製で4点ロックのフタがついた保存容器5点セット。作り置きのおかずをそのまま電子レンジで温め直せ、オーブンでグラタンを焼くこともできます。においや色が移らないので、カレーやキムチを入れても洗えば元どおり。フタのパッキンは外して洗える衛生設計です。",
        "price": 3280,
        "stock": 44,
        "image_slug": "stainless-bottle",
    },
    {
        "name": "マイクロファイバータオル",
        "slug": "microfiber-towel",
        "sku": "DLY-2024-038",
        "description": "髪の水分を綿タオルの倍の速さで吸い上げる超極細繊維のヘアタオル4枚組。ドライヤーの時間が短くなり、キューティクルへの熱のダメージを減らせます。厚みがないので絞りやすく、洗濯後は数時間で乾いて生乾きのにおいが出ません。ジムやプールのバッグにも小さく収まります。",
        "price": 1680,
        "stock": 80,
        "image_slug": "yoga-mat",
    },
    {
        "name": "ソープディスペンサー",
        "slug": "soap-dispenser",
        "sku": "DLY-2024-039",
        "description": "手をかざすと必要な分だけ泡が出るセンサー式のソープディスペンサー。調理中に生肉を触った手でボトルに触れずに済み、キッチンでも洗面所でも衛生的に使えます。詰め替え用のハンドソープを薄めて注ぐだけで、市販の泡ボトルよりランニングコストを抑えられます。単三電池で約半年動きます。",
        "price": 2280,
        "stock": 52,
        "image_slug": "stainless-bottle",
    },
    # ---- アウトドア ----
    {
        "name": "ワンタッチテント",
        "slug": "pop-up-tent",
        "sku": "OUT-2024-040",
        "description": "袋から出して広げるだけで数秒で立ち上がる2〜3人用のポップアップテント。ポールを組む必要がないので、子ども連れで日が暮れかけた設営でも慌てません。耐水圧1500mmのフライシートで小雨をしのぎ、メッシュの窓が結露と虫の侵入を抑えます。たたむと円盤状になり車のトランクに収まります。",
        "price": 12800,
        "sale_price": 9800,
        "stock": 18,
        "image_slug": "yoga-mat",
    },
    {
        "name": "寝袋",
        "slug": "sleeping-bag",
        "sku": "OUT-2024-041",
        "description": "快適使用温度5℃の封筒型シュラフ。中綿は化繊なので濡れても保温力が落ちにくく、春から秋のキャンプや車中泊に向きます。ファスナーを全開にすれば掛け布団として使え、2つ連結すればダブルサイズに。丸洗いできて、収納袋に圧縮すれば2Lペットボトルほどの大きさになります。",
        "price": 8980,
        "stock": 30,
        "image_slug": "yoga-mat",
    },
    {
        "name": "LEDランタン",
        "slug": "led-lantern",
        "sku": "OUT-2024-042",
        "description": "暖色から白色まで無段階に調光できる充電式LEDランタン。テーブルの上では食事がおいしく見える電球色、テント内での探し物には明るい昼白色と使い分けられます。底面のマグネットで鉄板に貼り付けられ、モバイルバッテリーとしてスマホへの給電も可能。停電時の備えにもなります。",
        "price": 3480,
        "sale_price": 2680,
        "stock": 60,
        "image_slug": "desk-light",
    },
    {
        "name": "折りたたみチェア",
        "slug": "folding-chair",
        "sku": "OUT-2024-043",
        "description": "座面高38cmで焚き火の炎に近い目線に座れるローチェア。アルミフレームで重さ1.2kg、たたむと肩掛けできる細長い袋に収まります。生地は1000デニールのポリエステルで火の粉に強く、背もたれのメッシュが背中の蒸れを逃がします。脚先が太く、砂浜や芝生でも沈み込みません。",
        "price": 5980,
        "stock": 34,
        "image_slug": "yoga-mat",
    },
    {
        "name": "登山用ザック30L",
        "slug": "hiking-backpack",
        "sku": "OUT-2024-044",
        "description": "日帰り登山にちょうどよい30Lのバックパック。背面のフレームが荷重を腰のベルトに逃がし、肩への負担を減らします。雨蓋の下にレインカバーを内蔵し、サイドのポケットは歩きながらボトルを抜き差しできる角度。ハイドレーションチューブの通し穴とポールの固定ループも備えます。",
        "price": 15800,
        "stock": 24,
        "image_slug": "yoga-mat",
    },
    {
        "name": "トレッキングポール",
        "slug": "trekking-poles",
        "sku": "OUT-2024-045",
        "description": "レバー式で長さを瞬時に変えられるアルミ製トレッキングポール2本組。登りは短く、下りは長く調整して膝への衝撃を和らげます。先端は岩場用の超硬チップと舗装路用のラバーキャップを付け替え可能。グリップはコルク製で汗を吸い、長時間握っても手のひらが滑りません。",
        "price": 7800,
        "stock": 28,
        "image_slug": "folding-umbrella",
    },
    {
        "name": "クーラーボックス",
        "slug": "cooler-box",
        "sku": "OUT-2024-046",
        "description": "発泡ウレタン断熱で保冷力を高めた20Lのクーラーボックス。板氷を入れれば真夏の車内でも翌朝まで氷が残り、2日間のキャンプの食材を守ります。フタは天板が平らでテーブル代わりになり、上に調理器具を置いても歪みません。内側は継ぎ目が少なく、汚れても丸ごと水洗いできます。",
        "price": 11800,
        "stock": 20,
        "image_slug": "stainless-bottle",
    },
    {
        "name": "焚き火台",
        "slug": "bonfire-stand",
        "sku": "OUT-2024-047",
        "description": "薪を井桁に組める幅40cmのステンレス焚き火台。空気が下から抜ける構造で煙が少なく、火付けに苦労しません。地面を焦がさない脚の高さがあり、直火禁止のキャンプ場でも使えます。五徳を渡せばダッチオーブンやケトルを載せられ、たたむと厚さ3cmの板状になります。",
        "price": 9800,
        "stock": 22,
        "status": "coming_soon",
        "image_slug": "yoga-mat",
    },
    {
        "name": "ソーラーチャージャー",
        "slug": "solar-charger",
        "sku": "OUT-2024-048",
        "description": "21W出力の折りたたみ式ソーラーパネル。晴天の直射日光なら数時間でスマホを満充電でき、電源の無いキャンプ場や災害時の備えとして役立ちます。パネルは4つ折りで文庫本ほどの厚みになり、四隅のハトメでザックの背面に吊るして歩きながら発電できます。日陰に入っても再接続は不要です。",
        "price": 8480,
        "stock": 26,
        "image_slug": "mobile-battery",
    },
    {
        "name": "トレイルランニングシューズ",
        "slug": "trail-running-shoes",
        "sku": "OUT-2024-049",
        "description": "濡れた木の根や落ち葉の上でも食いつく5mmラグのアウトソールを備えたトレイルランニングシューズ。前足部にプレートが入り、石を踏んでも足裏に痛みが出ません。アッパーは水はけのよいメッシュで、渡渉のあとも走りながら乾きます。踵のホールドが強く、下りで足が前に滑りません。",
        "price": 16800,
        "stock": 18,
        "image_slug": "yoga-mat",
    },
    {
        "name": "ハンモック",
        "slug": "hammock",
        "sku": "OUT-2024-050",
        "description": "耐荷重200kgのパラシュート生地のハンモック。木と木の間に吊るせば体をやさしく包み、川の音を聞きながら昼寝ができます。収納袋がそのままサイドポケットになり、スマホや文庫本を入れておけます。付属のストラップは木肌を傷めない幅広タイプで、長さを段階で調整できます。",
        "price": 6480,
        "stock": 30,
        "status": "suspended",
        "image_slug": "yoga-mat",
    },
    # ---- ファッション小物 ----
    {
        "name": "本革ベルト",
        "slug": "leather-belt",
        "sku": "FSN-2024-051",
        "description": "イタリアのタンナーが植物タンニンでなめした牛革のベルト。使い始めは硬めですが、締めるほどに腰の形へ沿って馴染み、色は飴色へと深まります。バックルは主張の控えめなシルバーで、スーツにもデニムにも合わせられます。長さは自分で切り詰められ、体型が変わっても使い続けられます。",
        "price": 5800,
        "sale_price": 4480,
        "stock": 40,
        "image_slug": "wrist-watch",
    },
    {
        "name": "二つ折り財布",
        "slug": "bifold-wallet",
        "sku": "FSN-2024-052",
        "description": "厚さ2cmに収まるコンパクトな牛革の二つ折り財布。カードポケットは段差をつけた6枚差しで、目的のカードを探さずに抜き出せます。小銭入れはL字ファスナーで大きく開き、レジ前で指を入れて硬貨を選べる深さ。角は手作業で磨いて丸められ、ポケットの中で生地を傷めません。",
        "price": 12800,
        "stock": 25,
        "image_slug": "wrist-watch",
    },
    {
        "name": "カシミヤマフラー",
        "slug": "cashmere-scarf",
        "sku": "FSN-2024-053",
        "description": "内モンゴル産カシミヤ100%の30×180cmマフラー。空気を含んだ起毛が首もとの熱を逃さず、薄手でもコートの襟の中でかさばりません。チクチクしにくい細番手の糸を使っているので、素肌に直接巻いても心地よく使えます。オフシーズンは畳んで防虫剤とともにしまってください。",
        "price": 12800,
        "sale_price": 9800,
        "stock": 22,
        "image_slug": "wrist-watch",
    },
    {
        "name": "レザートートバッグ",
        "slug": "leather-tote-bag",
        "sku": "FSN-2024-054",
        "description": "A4のノートPCと書類が縦に収まる牛革のトートバッグ。底に鋲がついていて床に置いても革が擦れず、自立するので中身を片手で出し入れできます。内側にはペンと名刺入れの定位置となる仕切りポケット。持ち手は肩に掛けられる長さで、荷物が重い日も手首に食い込みません。",
        "price": 28800,
        "stock": 14,
        "image_slug": "wrist-watch",
    },
    {
        "name": "ウールニット帽",
        "slug": "wool-beanie",
        "sku": "FSN-2024-055",
        "description": "メリノウールを二重に編んだ折り返し付きのニット帽。耳まで下ろせば真冬の通勤でも冷えを防ぎ、折り返しを浅くすれば春先の朝夕にちょうどよい厚みになります。ウール本来の調湿性で蒸れにくく、頭が汗ばんでもにおいがこもりません。手洗いで型崩れせずに洗えます。",
        "price": 3480,
        "stock": 45,
        "image_slug": "wrist-watch",
    },
    {
        "name": "サングラス",
        "slug": "sunglasses",
        "sku": "FSN-2024-056",
        "description": "可視光線透過率15%の偏光レンズを入れたウェリントン型サングラス。水面やアスファルトの照り返しを抑えるので、釣りや長距離の運転で目が疲れません。フレームは軽いアセテートで、鼻あては鼻筋から浮きにくい設計。UV400でまぶたの日焼けも防ぎます。",
        "price": 15800,
        "stock": 0,
        "image_slug": "wrist-watch",
    },
    {
        "name": "革製名刺入れ",
        "slug": "card-case",
        "sku": "FSN-2024-057",
        "description": "名刺を30枚ほど収められる薄型のレザーカードケース。マチが蛇腹状に広がるので、いただいた名刺と自分の名刺を分けて入れられます。開いたときに相手から見える面は縫い目を隠した仕立てで、商談の場でも所作がきれいに決まります。長く使うと角に艶が出て表情が変わります。",
        "price": 7800,
        "stock": 38,
        "image_slug": "wrist-watch",
    },
    {
        "name": "シルクネクタイ",
        "slug": "silk-necktie",
        "sku": "FSN-2024-058",
        "description": "京都で織られたシルク100%の8cm幅ネクタイ。厚みのある芯地が結び目にきれいなくぼみを作り、一日締めてもへたりません。無地に見えて光の角度で織り柄が浮かぶ生地で、就職活動から結婚式まで場所を選ばず使えます。掛けておけばシワは自然に落ちます。",
        "price": 9800,
        "stock": 10,
        "status": "discontinued",
        "image_slug": "wrist-watch",
    },
    {
        "name": "シューケアセット",
        "slug": "shoe-care-set",
        "sku": "FSN-2024-059",
        "description": "馬毛ブラシ・豚毛ブラシ・乳化性クリーム・防水スプレーをまとめた革靴の手入れセット。帰宅後に馬毛でほこりを落とし、月に一度クリームで油分を補えば、革が乾いてひび割れるのを防げます。木箱に一式が収まり、玄関に置いても生活感が出ないつくり。手順書が同梱されています。",
        "price": 6480,
        "stock": 30,
        "image_slug": "wrist-watch",
    },
    {
        "name": "レザーキーケース",
        "slug": "key-case",
        "sku": "FSN-2024-060",
        "description": "鍵を6本まで留められる牛革のキーケース。金具がスライドするので、鍵を大きく振り回さずに玄関の錠を開けられます。内側にはICカードを1枚差せるポケットがあり、通勤の改札もこれ1つで通れます。使うほどに手の脂を吸って柔らかくなり、鞄の内張りを傷つけません。",
        "price": 4980,
        "stock": 42,
        "image_slug": "wrist-watch",
    },
]

SEED_CATEGORIES = [
    {"name": "キッチン家電", "slug": "kitchen-appliances"},
    {"name": "生活家電", "slug": "home-appliances"},
    {"name": "日用品", "slug": "daily-goods"},
    {"name": "アウトドア", "slug": "outdoor"},
    {"name": "ファッション小物", "slug": "fashion-accessories"},
]

# 各商品スラッグに割り当てるカテゴリスラッグ。
# 新しいカテゴリは足さず既存の 5 つに配分する。home_page.py の novelty はレーンの
# カテゴリ分布で多様性を測るため、1 カテゴリに偏らせるとページ生成の挙動が歪む
# （現状は 12 商品 × 5 カテゴリ）。
PRODUCT_CATEGORY_SLUG = {
    "wireless-earphone": "home-appliances",
    "coffee-maker": "kitchen-appliances",
    "electric-kettle": "kitchen-appliances",
    "mobile-battery": "home-appliances",
    "folding-umbrella": "daily-goods",
    "desk-light": "home-appliances",
    "yoga-mat": "outdoor",
    "stainless-bottle": "daily-goods",
    "bluetooth-speaker": "home-appliances",
    "wrist-watch": "fashion-accessories",
    "smart-watch": "fashion-accessories",
    # キッチン家電
    "electric-pressure-cooker": "kitchen-appliances",
    "hand-blender": "kitchen-appliances",
    "oven-toaster": "kitchen-appliances",
    "rice-cooker": "kitchen-appliances",
    "coffee-grinder": "kitchen-appliances",
    "hot-sandwich-maker": "kitchen-appliances",
    "ih-cooking-heater": "kitchen-appliances",
    "food-processor": "kitchen-appliances",
    "food-steamer": "kitchen-appliances",
    "gooseneck-kettle": "kitchen-appliances",
    # 生活家電
    "air-purifier": "home-appliances",
    "circulator-fan": "home-appliances",
    "garment-steamer": "home-appliances",
    "robot-cleaner": "home-appliances",
    "humidifier": "home-appliances",
    "electric-blanket": "home-appliances",
    "usb-charging-station": "home-appliances",
    "bone-conduction-headphone": "home-appliances",
    # 日用品
    "insulated-tumbler": "daily-goods",
    "diatomite-bath-mat": "daily-goods",
    "laundry-net-set": "daily-goods",
    "aroma-diffuser": "daily-goods",
    "long-umbrella": "daily-goods",
    "rain-poncho": "daily-goods",
    "bamboo-cutting-board": "daily-goods",
    "glass-food-container": "daily-goods",
    "microfiber-towel": "daily-goods",
    "soap-dispenser": "daily-goods",
    # アウトドア
    "pop-up-tent": "outdoor",
    "sleeping-bag": "outdoor",
    "led-lantern": "outdoor",
    "folding-chair": "outdoor",
    "hiking-backpack": "outdoor",
    "trekking-poles": "outdoor",
    "cooler-box": "outdoor",
    "bonfire-stand": "outdoor",
    "solar-charger": "outdoor",
    "trail-running-shoes": "outdoor",
    "hammock": "outdoor",
    # ファッション小物
    "leather-belt": "fashion-accessories",
    "bifold-wallet": "fashion-accessories",
    "cashmere-scarf": "fashion-accessories",
    "leather-tote-bag": "fashion-accessories",
    "wool-beanie": "fashion-accessories",
    "sunglasses": "fashion-accessories",
    "card-case": "fashion-accessories",
    "silk-necktie": "fashion-accessories",
    "shoe-care-set": "fashion-accessories",
    "key-case": "fashion-accessories",
}

# ---------- 行動データ（ホームのレーンとパーソナライズのデモに必須）----------
#
# home_page.py の for_you / byw / recently_viewed / cart_reminder / top10 は行動データが
# 無いと 1 本も成立しない。かつ lane / ranked の最小件数は 4 件（_MIN_ITEMS_BY_LAYOUT）
# なので、各シグナルは 4 件以上を投入する。
#
# 注文は Order.created_at を server_default（= 投入時刻）に任せる。top10 は
# get_recent_popular_products の 7 日窓で集計するため、シード直後は全注文が窓に入る。
# 逆に言うとシードから 7 日以上放置した DB では top10 が空になる（make reset で復活する）。
SEED_ORDERS = [
    # user@example.com の購入実績。レビュー投稿の資格（cancelled 以外の注文で購入済み）を
    # 満たすよう、レビュー対象は必ずここに含める。
    {"user": "user", "status": "delivered", "items": [("wireless-earphone", 1), ("stainless-bottle", 1)]},
    {"user": "user", "status": "shipped", "items": [("coffee-maker", 1), ("yoga-mat", 1)]},
    # admin の購入実績。top10（7日窓の購入数ランキング）に十分な商品数と件数差を作る。
    # user 側で買い足すと exclude_ids（購入済み+カート）が膨らんで byw / category / sale の
    # 候補が痩せるため、ランキングの厚みは別ユーザーの注文で作る。
    {"user": "admin", "status": "delivered", "items": [("electric-kettle", 3), ("mobile-battery", 2), ("folding-umbrella", 4)]},
    {"user": "admin", "status": "delivered", "items": [("oven-toaster", 2), ("insulated-tumbler", 5), ("led-lantern", 3)]},
    {"user": "admin", "status": "paid", "items": [("bluetooth-speaker", 1), ("rice-cooker", 1), ("air-purifier", 2)]},
    {"user": "admin", "status": "shipped", "items": [("hiking-backpack", 1), ("cashmere-scarf", 2), ("microfiber-towel", 3)]},
]

# user@example.com のカート。cart_reminder レーンは lane の最小 4 件を要求する。
SEED_USER_CART_SLUGS = ["hand-blender", "insulated-tumbler", "led-lantern", "leather-belt"]

# user@example.com のお気に入り（プロフィールベクトルの重み 2.0 / 除外はされない）。
SEED_USER_WISHLIST_SLUGS = ["bifold-wallet", "cooler-box", "trekking-poles"]

# user@example.com の閲覧履歴（新しい順）。recently_viewed レーンの実体であり、
# byw のアンカー（先頭 3 件）もここから取られる。viewed_at は明示的に時刻をずらす
# （server_default に任せると全件同時刻になり viewed_at desc の並びが不定になるため）。
SEED_USER_VIEW_SLUGS = [
    "gooseneck-kettle",
    "air-purifier",
    "pop-up-tent",
    "cashmere-scarf",
    "folding-chair",
    "oven-toaster",
]

# レビュー: (ユーザーキー, 商品スラッグ, 評価, コメント)。
# 対象商品は SEED_ORDERS に購入実績があること（アプリ側の投稿資格と整合させる）。
SEED_REVIEWS = [
    ("user", "wireless-earphone", 5, "音質が良く、ノイズキャンセリングも効いていて満足しています。"),
    ("user", "stainless-bottle", 4, "保温性が高くて便利です。もう少し軽いと嬉しい。"),
    ("user", "coffee-maker", 5, "朝タイマーで挽きたてが飲めるのが最高。ミルの掃除も簡単でした。"),
    ("user", "yoga-mat", 4, "厚みがあって膝が痛くならない。収納バッグが少しきつめです。"),
    ("admin", "electric-kettle", 5, "沸くのが本当に早い。カップ1杯なら1分かかりません。"),
    ("admin", "insulated-tumbler", 5, "結露しないのでデスクで安心して使えています。"),
    ("admin", "oven-toaster", 4, "温度が細かく決められるので食パンがちょうどよく焼けます。"),
    ("admin", "led-lantern", 5, "調光の幅が広く、キャンプでも停電時でも役立ちました。"),
    ("admin", "air-purifier", 4, "花粉の時期に助かっています。静音モードなら寝室でも気になりません。"),
]

SEED_COUPONS = [
    {
        "code": "WELCOME10",
        "discount_type": "percent",
        "discount_value": 10,
        "min_order_amount": 0,
        "is_active": True,
        "expires_at": None,
    },
    {
        "code": "SAVE500",
        "discount_type": "fixed",
        "discount_value": 500,
        "min_order_amount": 5000,
        "is_active": True,
        "expires_at": None,
    },
]


# ---------- A/Bテスト（動作確認用の実験）----------
#
# レイアウト実験の実例。どちらの枝も「並び順の配列」を config に持つだけで、フロント側は
# その配列どおりに描画する。枝を増やしてもコードに if を足す必要がないのがこの持ち方の
# 利点で、レイアウト変更の検証を設定だけで回せる。
#
# salt はシードでは固定値にする（起動のたびに割り当てが変わると動作確認しづらいため）。
# 管理画面から新規作成する実験には UUID が自動採番される。

SEED_EXPERIMENTS = [
    {
        "key": "pdp_section_order",
        "name": "商品ページ下部セクションの並び順",
        "description": (
            "レビューとQ&Aを先に見せると購入率が上がるかを検証する。"
            "社会的証明を先に置くほど後押しになる、という仮説。"
        ),
        "salt": "seed-pdp-section-order",
        "status": "running",
        "traffic_allocation": 100,
        "primary_metric": "purchase",
        "variants": [
            {
                "key": "control",
                "name": "現行（おすすめ先行）",
                "weight": 50,
                "is_control": True,
                "config": {
                    "sections": ["recommendations", "related", "reviews", "qa", "recently"]
                },
            },
            {
                "key": "social_first",
                "name": "レビュー・Q&A先行",
                "weight": 50,
                "is_control": False,
                "config": {
                    "sections": ["reviews", "qa", "recommendations", "related", "recently"]
                },
            },
        ],
    },
    {
        "key": "pdp_cta_copy",
        "name": "カート追加ボタンの文言",
        "description": "文言だけを変える実験の例。コード分岐なしで config の差し替えだけで回せる。",
        "salt": "seed-pdp-cta-copy",
        # 下書きのまま投入する。管理画面から「開始」を押して配信を始める流れを試せる。
        "status": "draft",
        "traffic_allocation": 100,
        "primary_metric": "add_to_cart",
        "variants": [
            {
                "key": "control",
                "name": "カートに追加",
                "weight": 50,
                "is_control": True,
                "config": {"label": "カートに追加"},
            },
            {
                "key": "urgent",
                "name": "いますぐカートに入れる",
                "weight": 50,
                "is_control": False,
                "config": {"label": "いますぐカートに入れる"},
            },
        ],
    },
]


def seed_data(db: Session) -> None:
    """Insert initial seed data if the users table is empty."""
    if db.query(User).first() is not None:
        return

    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("admin123"),
        name="管理者",
        role="admin",
    )
    user = User(
        email="user@example.com",
        hashed_password=hash_password("user123"),
        name="山田太郎",
        role="user",
    )
    db.add_all([admin, user])
    db.flush()

    categories_by_slug: dict[str, Category] = {}
    for cat in SEED_CATEGORIES:
        category = Category(name=cat["name"], slug=cat["slug"])
        db.add(category)
        categories_by_slug[cat["slug"]] = category
    db.flush()

    products_by_slug: dict[str, Product] = {}
    for item in SEED_PRODUCTS:
        category = categories_by_slug.get(PRODUCT_CATEGORY_SLUG.get(item["slug"], ""))
        # 画像アセットが無い商品（smart-watch 等）は image_slug で既存 SVG を流用。
        image_slug = item.get("image_slug", item["slug"])
        product = Product(
            name=item["name"],
            sku=item.get("sku"),
            description=item["description"],
            price=item["price"],
            sale_price=item.get("sale_price"),
            stock=item["stock"],
            status=item.get("status", "on_sale"),
            image_url=_product_image(image_slug),
            category=category,
            images=[
                ProductImage(image_url=_product_image(g), sort_order=index)
                for index, g in enumerate(item.get("gallery", []))
            ],
        )
        db.add(product)
        products_by_slug[item["slug"]] = product
    db.flush()

    for coupon in SEED_COUPONS:
        db.add(Coupon(**coupon))

    # 動作確認用の行動データを投入する（購入・カート・お気に入り・閲覧・レビュー）。
    users_by_key = {"admin": admin, "user": user}
    for spec in SEED_ORDERS:
        _place_order(db, users_by_key[spec["user"]], spec["status"], spec["items"], products_by_slug)

    for slug in SEED_USER_CART_SLUGS:
        db.add(CartItem(user_id=user.id, product_id=products_by_slug[slug].id, quantity=1))

    for slug in SEED_USER_WISHLIST_SLUGS:
        db.add(WishlistItem(user_id=user.id, product_id=products_by_slug[slug].id))

    # 先頭ほど新しくなるよう 1 時間ずつ遡らせる。同時刻だと viewed_at desc が不定になり、
    # 「最近見た商品」の並び（＝このレーンの意味そのもの）が再現しなくなる。
    now = datetime.now(timezone.utc)
    for index, slug in enumerate(SEED_USER_VIEW_SLUGS):
        db.add(
            ProductView(
                user_id=user.id,
                product_id=products_by_slug[slug].id,
                view_count=1,
                viewed_at=now - timedelta(hours=index),
            )
        )

    for user_key, slug, rating, comment in SEED_REVIEWS:
        db.add(
            Review(
                product_id=products_by_slug[slug].id,
                user_id=users_by_key[user_key].id,
                rating=rating,
                comment=comment,
            )
        )

    for spec in SEED_EXPERIMENTS:
        db.add(
            Experiment(
                key=spec["key"],
                name=spec["name"],
                description=spec["description"],
                salt=spec["salt"],
                status=spec["status"],
                traffic_allocation=spec["traffic_allocation"],
                primary_metric=spec["primary_metric"],
                # 配信中で投入する実験だけ開始時刻を持たせる（結果画面の期間表示用）。
                started_at=now if spec["status"] == "running" else None,
                variants=[
                    ExperimentVariant(
                        key=v["key"],
                        name=v["name"],
                        weight=v["weight"],
                        is_control=v["is_control"],
                        config=v["config"],
                    )
                    for v in spec["variants"]
                ],
            )
        )

    db.commit()


def _place_order(
    db: Session,
    buyer: User,
    status: str,
    items: list[tuple[str, int]],
    products_by_slug: dict[str, Product],
) -> None:
    """注文 1 件を在庫の引き当て込みで作る。

    金額は必ず effective_price（セール中ならセール価格）でスナップショットし、
    OrderItem に注文時点の商品名・価格を焼き付ける。商品マスタを参照して後から
    再計算しないのが運用ルールなので、シードもその形に揃えておく。
    """
    order_items: list[OrderItem] = []
    total = 0
    for slug, quantity in items:
        product = products_by_slug[slug]
        product.stock = max(0, product.stock - quantity)
        price = product.effective_price
        total += price * quantity
        order_items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                price=price,
                quantity=quantity,
            )
        )
    db.add(
        Order(
            user_id=buyer.id,
            total_amount=total,
            discount_amount=0,
            coupon_code=None,
            status=status,
            shipping_address="東京都渋谷区1-2-3 サンプルビル101\nTEL: 03-1234-5678",
            items=order_items,
        )
    )
