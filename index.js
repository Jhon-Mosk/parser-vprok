const url = process.argv[2];
const location = process.argv[3];

const puppeteer = require("puppeteer");
const fs = require("node:fs");
const { basename } = require("path");

/*
  задержка перед парсингом, при частых попытках начинают проверять браузер,
  потом редиректить на нужную страницу
*/
const PARSE_DELAY = 10000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const saveData = async (data, path) => {
  const { price, priceOld, ratingValue, reviewCount } = data;
  const txt = `price=${price}\npriceOld=${priceOld}\nrating=${ratingValue}\nreviewCount=${reviewCount}`;
  await fs.promises.writeFile(`${path}/product.txt`, txt, "utf-8");
};

const parser = async (url, location) => {
  console.log({ url, location });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(url);

  await page.setViewport({ width: 1920, height: 1080 });

  // при частых попытках начинают проверять браузер, потом редиректить на нужную страницу
  await pause(PARSE_DELAY);

  try {
    // выбираю регион
    const regionBtnSelector = ".Region_region__6OUBn";
    await page.waitForSelector(regionBtnSelector);
    await page.click(regionBtnSelector);
    const regionItemsSelector =
      ".UiRegionListBase_list__cH0fK > .UiRegionListBase_item___ly_A";
    await page.waitForSelector(regionItemsSelector);
    const regionItems = await page.$$(regionItemsSelector);
    for (const item of regionItems) {
      const itemText = await page.evaluate((el) => el.textContent, item);
      if (itemText === location) {
        await item.click();
        break;
      }
    }

    await pause(1000);

    // нахожу рейтинг
    const ratingInfo = await page.$$eval(
      ".Summary_section__n5aJB > [itemprop]",
      (elements) => {
        const info = {};
        elements.forEach((element) => {
          const itemProp = element.getAttribute("itemprop");
          if (itemProp === "ratingValue" || itemProp === "reviewCount") {
            info[itemProp] = element.getAttribute("content");
          }
        });
        return info;
      }
    );

    console.log("ratingInfo:", ratingInfo);

    // нахожу цены
    const prices = await page.$$eval(
      ".PriceInfo_root__GX9Xp .Price_price__QzA8L",
      (elements) => {
        const result = elements.map((element) => {
          const mainPrice = element.firstChild.textContent;
          const fraction = element
            .querySelector(".Price_fraction__lcfu_")
            .textContent.replace(/₽|\/шт|\/кг/g, "")
            .trim();
          return `${mainPrice}${fraction}`;
        });

        return {
          priceOld: result[0],
          price: result[1],
        };
      }
    );

    console.log("prices :>> ", prices);

    const dir = `./results/${location}/${basename(url)}`;
    await fs.promises.mkdir(dir, { recursive: true });

    // сохраняю данные
    await saveData({ ...ratingInfo, ...prices }, dir);
    console.log("Data was saved");

    // делаю скриншот
    await page.screenshot({
      path: `${dir}/screenshot.jpg`,
      fullPage: true,
    });

    console.log(`Parse success: ${url} ${location}`);
  } catch (error) {
    console.log(error);
    console.log(`Parse failed: ${url} ${location}`);
  }

  await browser.close();
};

parser(url, location).then(console.log).catch(console.error);
