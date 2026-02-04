# 독서로_학교별_존재검증.py
# 독서로_학교별_존재검증
# py 독서로_학교별_존재검증.py

import time
import pandas as pd

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

options = Options()
service = Service(ChromeDriverManager(driver_version="141.0.7390.0").install())
driver = webdriver.Chrome(service=service, options=options)

# ─── 설정 ───
EXCEL_IN           = "도서견적서.xlsx"
EXCEL_OUT          = "도서견적서_결과.xlsx"
READ365_HOME_URL   = "https://read365.edunet.net/SchoolSearch"
CHROME_DRIVER_PATH = "C:\\chromedriver.exe"  # 크롬드라이버 위치
# ───────────

# 1) 엑셀 파일 읽기
df = pd.read_excel(EXCEL_IN)

# 2) Selenium 준비
options = Options()
# options.add_argument("--headless")  # 실행 과정을 보고 싶으면 주석 처리
options.add_argument("--disable-gpu")
service = Service(executable_path=CHROME_DRIVER_PATH)
driver = webdriver.Chrome(service=service, options=options)
wait = WebDriverWait(driver, 10)

results = []
for _, row in df.iterrows():
    school = row["학교명"].strip()
    title  = row["도서명"].strip()
    pub_o  = row["출판사"].strip()
    auth_o = row["저자"].strip()

    # ── (A) 페이지 열고 '우리학교 도서검색' 탭 클릭 ──
    driver.get(READ365_HOME_URL)
    time.sleep(1)
    try:
        wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "우리학교 도서검색"))).click()
    except:
        pass
    time.sleep(1)

    # ── (B) 학교 선택 ──
    try:
        # 1) 지역 선택 (id='city')
        sel_city = Select(wait.until(EC.presence_of_element_located((By.ID, "city"))))
        sel_city.select_by_visible_text("경기")  # '경기'로 설정
        time.sleep(0.5)

        # 2) 학교급 선택 (id='schoolType')
        sel_type = Select(wait.until(EC.presence_of_element_located((By.ID, "schoolType"))))
        sel_type.select_by_visible_text("초등학교")
        time.sleep(0.5)

        # 3) 학교명 입력창 (id='schoolName')
        inp_school = wait.until(EC.presence_of_element_located((By.ID, "schoolName")))
        inp_school.clear().dr
        inp_school.send_keys(school)

        # 4) '학교찾기' 버튼 클릭 (class='search-school-btn')
        wait.until(EC.element_to_be_clickable((
            By.CSS_SELECTOR,
            "button.search-school-btn"
        ))).click()
        time.sleep(1)

        # 5) 첫 번째 검색 결과 클릭
        wait.until(EC.element_to_be_clickable((
            By.CSS_SELECTOR,
            ".school_list_wrap .school_box"
        ))).click()
        time.sleep(1)
    except Exception:
        results.append({**row.to_dict(),
                        "검색학교": school,
                        "존재여부": "❌",
                        "불일치 사유": "학교 검색 실패"})
        continue

    # ── (C) 도서 검색 (제목만 입력 후 저자 확인) ──
    try:
        # 1) 책 검색창 입력 (id='headerSearch')
        inp_book = wait.until(EC.presence_of_element_located((By.ID, "headerSearch")))
        inp_book.clear()
        inp_book.send_keys(title)

        # 2) 검색 버튼 클릭 (class='btn-search')
        wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn-search"))).click()
        time.sleep(1)

        # 3) 결과 목록 대기
        items = wait.until(EC.presence_of_all_elements_located((
            By.CSS_SELECTOR, ".book_list_wrap .book_box"
        )))
    except Exception:
        items = []

    # ── (D) 저자 일치 여부 확인 ──
    found = False
    for it in items:
        try:
            auth_text = it.find_element(By.CSS_SELECTOR, ".book_info .author").text.strip()
            if auth_o in auth_text:
                found = True
                break
        except:
            continue

    results.append({**row.to_dict(),
                    "검색학교": school,
                    "존재여부": "✅" if found else "❌",
                    "불일치 사유": "" if found else "저자 미일치 또는 도서 없음"})

# 3) 마무리 및 파일 저장
driver.quit()
out_df = pd.DataFrame(results)
out_df.to_excel(EXCEL_OUT, index=False)

print(f"완료! 총 권수: {len(out_df)}, 불일치 건수: {(out_df['존재여부']=='❌').sum()}")
print(f"결과 파일 → {EXCEL_OUT}")