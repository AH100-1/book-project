from __future__ import annotations

import os
import time
from typing import Optional, Tuple

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchFrameException


class Read365Bot:
    BASE_URL = "https://read365.edunet.net/SchoolSearch"

    def __init__(
        self,
        headless: bool = False,
        window_width: int = 1400,
        window_height: int = 900,
        implicit_wait: int = 2,
        explicit_wait: int = 15,
        scroll_repeats: int = 7,
        scroll_interval_ms: int = 400,
        verbose: bool = True,
    ) -> None:
        self.headless = headless
        self.window_width = window_width
        self.window_height = window_height
        self.implicit_wait = implicit_wait
        self.explicit_wait = explicit_wait
        self.scroll_repeats = scroll_repeats
        self.scroll_interval_ms = scroll_interval_ms
        self.verbose = verbose
        self.driver: Optional[webdriver.Chrome] = None

    def _log(self, msg: str) -> None:
        if self.verbose:
            print(f"[READ365] {msg}")

    def start(self) -> None:
        options = Options()
        if self.headless:
            options.add_argument("--headless=new")
        options.add_argument(f"--window-size={self.window_width},{self.window_height}")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        chrome_binary = os.getenv("CHROME_BINARY")
        if chrome_binary:
            options.binary_location = chrome_binary
        # 1) Selenium Manager 시도 (권장; Selenium 4.10+)
        try:
            self._log("init driver via Selenium Manager")
            self.driver = webdriver.Chrome(options=options)
        except Exception as e1:
            # 2) webdriver-manager 폴백
            self._log(f"Selenium Manager failed: {e1}; fallback to webdriver-manager")
            service = ChromeService(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
        self.driver.implicitly_wait(self.implicit_wait)
        self._log("open page")
        self.driver.get(self.BASE_URL)
        self._wait_page_ready()
        self._try_switch_into_form_iframe()

    def close(self) -> None:
        if self.driver:
            try:
                self.driver.switch_to.default_content()
            except Exception:
                pass
            self.driver.quit()
            self.driver = None

    def _wait(self):
        if not self.driver:
            raise RuntimeError("driver not started")
        return WebDriverWait(self.driver, self.explicit_wait)

    def _wait_page_ready(self) -> None:
        if not self.driver:
            return
        WebDriverWait(self.driver, max(self.explicit_wait, 15)).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )

    def _try_switch_into_form_iframe(self) -> None:
        if not self.driver:
            return
        try:
            self.driver.switch_to.default_content()
            iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
            for fr in iframes:
                try:
                    self.driver.switch_to.frame(fr)
                    selects = self.driver.find_elements(By.TAG_NAME, "select")
                    if selects:
                        self._log("entered iframe with form")
                        return
                except Exception:
                    continue
                finally:
                    self.driver.switch_to.default_content()
            self.driver.switch_to.default_content()
        except NoSuchFrameException:
            pass

    def _try_js_click(self, selector: str) -> bool:
        if not self.driver:
            return False
        try:
            el = self.driver.execute_script(
                "return document.querySelector(arguments[0]);", selector
            )
            if el:
                self.driver.execute_script("arguments[0].click();", el)
                return True
        except Exception:
            return False
        return False

    def _select_option_by_visible_text_js(self, select_css: str, text: str) -> bool:
        if not self.driver:
            return False
        script = r"""
        const sel = document.querySelector(arguments[0]);
        if (!sel) return false;
        const want = arguments[1].trim();
        let hit = false;
        for (const opt of sel.options) {
          if (opt.text.trim() === want) { opt.selected = true; sel.value = opt.value; hit = true; break; }
        }
        if (hit) { sel.dispatchEvent(new Event('change', {bubbles:true})); }
        return hit;
        """
        try:
            return bool(self.driver.execute_script(script, select_css, text))
        except Exception:
            return False

    def select_our_school_tab(self) -> bool:
        wait = self._wait()
        self._wait_page_ready()
        self._try_switch_into_form_iframe()
        self._log("click tab: 우리학교 도서검색")
        selectors_xpath = [
            "//a[contains(., '우리학교 도서검색') or contains(., '우리 학교 도서검색')]",
            "//button[contains(., '우리학교 도서검색') or contains(., '우리 학교 도서검색')]",
            "//li[contains(@class,'tab')]/a[contains(., '우리')]",
        ]
        for xp in selectors_xpath:
            try:
                tab = wait.until(EC.element_to_be_clickable((By.XPATH, xp)))
                tab.click()
                return True
            except Exception:
                continue
        for css in [
            "a[href*='SchoolSearch']",
            "#ourSchoolTab a",
            "li.tab a",
        ]:
            if self._try_js_click(css):
                return True
        self._log("tab not found; continue anyway")
        return False

    def set_region_and_level(self, region_name: str, school_level: str) -> bool:
        wait = self._wait()
        self._wait_page_ready()
        self._try_switch_into_form_iframe()
        self._log(f"select region/level: {region_name} / {school_level}")
        try:
            region = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "select#regionSelect, select[name='region'], form select[name='region']"))
            )
            level = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "select#levelSelect, select[name='level'], form select[name='level']"))
            )
            from selenium.webdriver.support.ui import Select

            Select(region).select_by_visible_text(region_name)
            Select(level).select_by_visible_text(school_level)
            return True
        except TimeoutException:
            pass
        except Exception:
            pass
        hit_region = self._select_option_by_visible_text_js("select#regionSelect, select[name='region']", region_name)
        hit_level = self._select_option_by_visible_text_js("select#levelSelect, select[name='level']", school_level)
        if hit_region and hit_level:
            return True
        try:
            selects = self.driver.find_elements(By.TAG_NAME, "select") if self.driver else []
            if len(selects) >= 2:
                from selenium.webdriver.support.ui import Select

                Select(selects[0]).select_by_visible_text(region_name)
                Select(selects[1]).select_by_visible_text(school_level)
                return True
        except Exception:
            pass
        self._log("region/level select failed")
        return False

    def _normalize(self, s: str) -> str:
        return "".join(s.split())

    def search_school(self, school_name: str, school_level: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
        wait = self._wait()
        self._wait_page_ready()
        self._try_switch_into_form_iframe()
        self._log(f"search school: {school_name}")
        try:
            input_box = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "input#schoolName, input[name='schoolName'], input[name='school_name']"))
            )
            input_box.clear()
            input_box.send_keys(school_name)
            search_btn = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., '검색') and not(contains(., 'ISBN'))]"))
            )
            old_url = self.driver.current_url if self.driver else ""
            search_btn.click()
            # 결과 목록에서 우선순위: 1) 정확히 '학교명+학교급' 포함, 2) '학교명' 포함, 3) 첫 항목
            want_full = (school_name or "").strip()
            if school_level and school_level not in want_full:
                want_full = f"{want_full}{school_level.strip()}"  # 예: 금남초 + 초등학교 → 금남초등학교
            want_full_norm = self._normalize(want_full)
            want_name_norm = self._normalize(school_name or "")
            matched_text: Optional[str] = None
            try:
                wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "ul#schoolList li, .school-list li, ul.search-result li")))
                candidates = (self.driver.find_elements(By.CSS_SELECTOR, "ul#schoolList li, .school-list li, ul.search-result li") if self.driver else [])
                target = None
                # 1) 정확 매칭(공백 무시)
                for li in candidates:
                    text = li.text.strip()
                    if self._normalize(text).find(want_full_norm) != -1:
                        target = li
                        matched_text = text
                        break
                # 2) 부분 매칭(학교명만)
                if not target:
                    for li in candidates:
                        text = li.text.strip()
                        if want_name_norm and self._normalize(text).find(want_name_norm) != -1:
                            target = li
                            matched_text = text
                            break
                # 3) 첫 항목 폴백
                if not target and candidates:
                    target = candidates[0]
                    matched_text = target.text.strip()
                if target is not None:
                    link = None
                    try:
                        link = target.find_element(By.CSS_SELECTOR, "a, label")
                    except Exception:
                        pass
                    if link:
                        try:
                            link.click()
                        except Exception:
                            self.driver.execute_script("arguments[0].click();", link)
                    else:
                        target.click()
            except TimeoutException:
                self._log("no school search result; continue on current page")
            # URL 변경 대기 (최대 10초)
            try:
                WebDriverWait(self.driver, 10).until(lambda d: d.current_url != old_url)
            except Exception:
                pass
            current = self.driver.current_url if self.driver else None
            self._log(f"at URL: {current} | matched: {matched_text}")
            return current, matched_text
        except Exception as e:
            self._log(f"search school failed: {e}")
            return None, None

    def search_isbn(self, isbn13: str) -> bool:
        wait = self._wait()
        self._wait_page_ready()
        self._try_switch_into_form_iframe()
        self._log(f"search ISBN: {isbn13}")
        try:
            isbn_input = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "input#isbn, input[name='isbn']"))
            )
            isbn_input.clear()
            isbn_input.send_keys(isbn13)
            btn = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'ISBN') and contains(., '검색')]"))
            )
            btn.click()
            return True
        except Exception as e:
            self._log(f"search ISBN failed: {e}")
            return False

    def scroll_results(self) -> None:
        if not self.driver:
            return
        self._log("scroll results")
        for _ in range(self.scroll_repeats):
            self.driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
            time.sleep(self.scroll_interval_ms / 1000.0)

    def count_items(self) -> int:
        wait = self._wait()
        try:
            items = wait.until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "ul.book-list.list-type.list > li, ul.book-list > li"))
            )
            count = len(items)
            self._log(f"items={count}")
            return count
        except TimeoutException:
            self._log("items=0 (timeout)")
            return 0

