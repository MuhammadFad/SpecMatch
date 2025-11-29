from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from bs4 import BeautifulSoup
import json
import time
import csv

class LaptopScraperSelenium:
    def __init__(self):
        self.base_url = "https://www.paklap.pk/laptops-prices.html"
        self.all_laptops_data = []
        self.driver = None
        
    def setup_driver(self):
        """Setup Chrome driver with options"""
        chrome_options = Options()
        # Uncomment the line below to run in headless mode (no browser window)
        # chrome_options.add_argument('--headless')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # Initialize driver
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        print("✓ Chrome browser initialized")
    
    def close_driver(self):
        """Close the browser"""
        if self.driver:
            self.driver.quit()
            print("✓ Browser closed")
    
    def extract_product_links(self, page_number):
        """Extract all product links from a catalog page"""
        url = f"{self.base_url}?p={page_number}"
        print(f"\n{'='*60}")
        print(f"Scraping page {page_number}: {url}")
        print(f"{'='*60}")
        
        try:
            self.driver.get(url)
            
            # Wait for products to load
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.CLASS_NAME, "product-item-link"))
            )
            
            # Give extra time for all products to load
            time.sleep(2)
            
            # Get page source and parse with BeautifulSoup
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
            
            # Find all product links
            product_links = []
            link_elements = soup.find_all('a', class_='product-item-link')
            
            for link in link_elements:
                href = link.get('href')
                if href and href.startswith('http'):
                    product_links.append(href)
            
            print(f"Found {len(product_links)} products on page {page_number}")
            return product_links
            
        except TimeoutException:
            print(f"Timeout waiting for products on page {page_number}")
            return []
        except Exception as e:
            print(f"Error extracting links from page {page_number}: {e}")
            return []
    
    def extract_images(self, soup):
        """Extract at least 2 images from the product page"""
        images = []
        
        # Method 1: Look for fotorama gallery images
        gallery_images = soup.find_all('img', class_='fotorama__img')
        for img in gallery_images[:10]:
            src = img.get('src')
            if src and src not in images:
                images.append(src)
        
        # Method 2: Look for product-image-photo
        if len(images) < 2:
            product_images = soup.find_all('img', class_='product-image-photo')
            for img in product_images:
                src = img.get('src')
                if src and src not in images:
                    images.append(src)
        
        # Method 3: Look in data attributes
        if len(images) < 2:
            for img_tag in soup.find_all('img'):
                data_src = img_tag.get('data-src') or img_tag.get('data-zoom-image')
                if data_src and data_src not in images:
                    images.append(data_src)
        
        # Method 4: Try to find image URLs in JavaScript/data attributes
        if len(images) < 2:
            for img_tag in soup.find_all('img'):
                src = img_tag.get('src')
                if src and 'laptop' in src.lower() and src not in images:
                    images.append(src)
        
        return images[:10]
    
    def extract_specifications(self, soup):
        """Extract all specifications from the table"""
        specifications = {}
        
        # Find the table with id 'product-attribute-specs-table'
        specs_table = soup.find('table', id='product-attribute-specs-table')
        
        if specs_table:
            rows = specs_table.find_all('tr')
            for row in rows:
                th = row.find('th', class_='col label')
                td = row.find('td', class_='col data')
                
                if th and td:
                    spec_name = th.get_text(strip=True)
                    spec_value = td.get_text(strip=True)
                    specifications[spec_name] = spec_value
        
        # Alternative: Look for additional-attributes table
        if not specifications:
            wrapper = soup.find('div', class_='additional-attributes-wrapper')
            if wrapper:
                table = wrapper.find('table', class_='additional-attributes')
                if table:
                    rows = table.find_all('tr')
                    for row in rows:
                        th = row.find('th')
                        td = row.find('td')
                        if th and td:
                            spec_name = th.get_text(strip=True)
                            spec_value = td.get_text(strip=True)
                            specifications[spec_name] = spec_value
        
        return specifications
    
    def extract_product_name(self, soup):
        """Extract product name"""
        title_tag = soup.find('h1', class_='page-title')
        if title_tag:
            return title_tag.get_text(strip=True)
        
        name_span = soup.find('span', {'data-ui-id': 'page-title-wrapper'})
        if name_span:
            return name_span.get_text(strip=True)
        
        og_title = soup.find('meta', property='og:title')
        if og_title:
            return og_title.get('content', '')
        
        return "Unknown Product"
    
    def extract_price(self, soup):
        """Extract product price"""
        price_container = soup.find('span', class_='price')
        if price_container:
            return price_container.get_text(strip=True)
        
        price_meta = soup.find('meta', property='product:price:amount')
        if price_meta:
            return price_meta.get('content', '')
        
        return "N/A"
    
    def scrape_product_page(self, product_url):
        """Scrape individual product page for all details"""
        print(f"  - Scraping: {product_url}")
        
        try:
            self.driver.get(product_url)
            
            # Wait for the specifications table to load
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.ID, "product-attribute-specs-table"))
                )
            except TimeoutException:
                # Table might not be present immediately, wait a bit more
                time.sleep(2)
            
            # Get page source and parse
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
            
            # Extract all data
            product_data = {
                'url': product_url,
                'name': self.extract_product_name(soup),
                'price': self.extract_price(soup),
                'images': self.extract_images(soup),
                'specifications': self.extract_specifications(soup)
            }
            
            # Print summary
            print(f"    ✓ Name: {product_data['name'][:60]}...")
            print(f"    ✓ Images found: {len(product_data['images'])}")
            print(f"    ✓ Specifications found: {len(product_data['specifications'])}")
            
            return product_data
            
        except Exception as e:
            print(f"    ✗ Error scraping product: {e}")
            return None
    
    def scrape_all_pages(self, start_page=1, end_page=5):
        """Main method to scrape all pages"""
        print("\n" + "="*60)
        print("PAKLAP.PK LAPTOP SCRAPER (Selenium)")
        print(f"Scraping pages {start_page} to {end_page}")
        print("="*60)
        
        # Setup browser
        self.setup_driver()
        
        total_products = 0
        
        try:
            for page_num in range(start_page, end_page + 1):
                # Get all product links from the catalog page
                product_links = self.extract_product_links(page_num)
                
                # Scrape each product page
                for idx, product_url in enumerate(product_links, 1):
                    print(f"\n[Page {page_num} - Product {idx}/{len(product_links)}]")
                    
                    product_data = self.scrape_product_page(product_url)
                    
                    if product_data:
                        self.all_laptops_data.append(product_data)
                        total_products += 1
                    
                    # Be polite - add delay between requests
                    time.sleep(1.5)
                
                # Longer delay between pages
                if page_num < end_page:
                    print(f"\nCompleted page {page_num}. Waiting before next page...")
                    time.sleep(3)
        
        finally:
            # Always close the browser
            self.close_driver()
        
        print("\n" + "="*60)
        print(f"SCRAPING COMPLETED!")
        print(f"Total laptops scraped: {total_products}")
        print("="*60)
        
        return self.all_laptops_data
    
    def save_to_json(self, filename='laptops_data.json'):
        """Save scraped data to JSON file"""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.all_laptops_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✓ Data saved to {filename}")
        print(f"  Total laptops: {len(self.all_laptops_data)}")
        
        if len(self.all_laptops_data) > 0:
            total_images = sum(len(laptop['images']) for laptop in self.all_laptops_data)
            total_specs = sum(len(laptop['specifications']) for laptop in self.all_laptops_data)
            
            print(f"  Total images: {total_images}")
            print(f"  Total specifications: {total_specs}")
            print(f"  Average images per laptop: {total_images/len(self.all_laptops_data):.1f}")
            print(f"  Average specs per laptop: {total_specs/len(self.all_laptops_data):.1f}")
    
    def save_to_csv(self, filename='laptops_data.csv'):
        """Save scraped data to CSV file"""
        if not self.all_laptops_data:
            print("No data to save!")
            return
        
        # Prepare CSV data
        csv_rows = []
        
        for laptop in self.all_laptops_data:
            row = {
                'Name': laptop['name'],
                'Price': laptop['price'],
                'URL': laptop['url'],
                'Image_1': laptop['images'][0] if len(laptop['images']) > 0 else '',
                'Image_2': laptop['images'][1] if len(laptop['images']) > 1 else '',
                'Image_3': laptop['images'][2] if len(laptop['images']) > 2 else '',
                'Image_4': laptop['images'][3] if len(laptop['images']) > 3 else '',
                'Image_5': laptop['images'][4] if len(laptop['images']) > 4 else '',
                'All_Images': '|'.join(laptop['images']),
            }
            
            # Add all specifications as separate columns
            for spec_name, spec_value in laptop['specifications'].items():
                clean_name = spec_name.strip().replace('\n', ' ')
                row[clean_name] = spec_value
            
            csv_rows.append(row)
        
        # Get all unique column names
        all_columns = set()
        for row in csv_rows:
            all_columns.update(row.keys())
        
        # Sort columns
        fixed_cols = ['Name', 'Price', 'URL', 'Image_1', 'Image_2', 'Image_3', 'Image_4', 'Image_5', 'All_Images']
        spec_cols = sorted([col for col in all_columns if col not in fixed_cols])
        final_columns = fixed_cols + spec_cols
        
        # Write to CSV
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=final_columns)
            writer.writeheader()
            writer.writerows(csv_rows)
        
        print(f"\n✓ Data also saved to {filename}")
        print(f"  Total columns: {len(final_columns)}")


def main():
    """Main execution function"""
    scraper = LaptopScraperSelenium()
    
    try:
        # Scrape all 5 pages
        laptops_data = scraper.scrape_all_pages(start_page=1, end_page=5)
        
        # Save to JSON
        scraper.save_to_json('laptops_data.json')
        
        # Save to CSV
        scraper.save_to_csv('laptops_data.csv')
        
        print("\n" + "="*60)
        print("SCRAPING SESSION COMPLETED SUCCESSFULLY!")
        print("="*60)
        
    except KeyboardInterrupt:
        print("\n\nScraping interrupted by user!")
        scraper.close_driver()
        
        # Save whatever data we have so far
        if scraper.all_laptops_data:
            print("Saving partial data...")
            scraper.save_to_json('laptops_data_partial.json')
            scraper.save_to_csv('laptops_data_partial.csv')
    
    except Exception as e:
        print(f"\n\nError during scraping: {e}")
        scraper.close_driver()


if __name__ == "__main__":
    main()
