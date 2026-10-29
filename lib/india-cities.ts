// Indian city → state, for sources that give a bare city name (YouTube, Google Analytics),
// so their cities can be added up by state on the India map. Meta already labels its cities
// with the state, so it doesn't need this. A city not listed here simply isn't placed on the
// map — it still shows in the City list.

const BY_STATE: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam", "Vizag", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Tirupati", "Rajahmundry", "Rajamahendravaram", "Kakinada", "Kadapa", "Anantapur", "Eluru", "Ongole", "Vizianagaram", "Srikakulam", "Chittoor", "Machilipatnam", "Amaravati"],
  "Arunachal Pradesh": ["Itanagar"],
  "Assam": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur", "Nagaon"],
  "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Begusarai", "Katihar"],
  "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Durg", "Korba", "Raigarh"],
  "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Baroda", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Junagadh", "Anand", "Navsari", "Bharuch", "Morbi", "Mehsana", "Vapi"],
  "Haryana": ["Gurugram", "Gurgaon", "Faridabad", "Panipat", "Ambala", "Karnal", "Hisar", "Rohtak", "Sonipat", "Yamunanagar", "Panchkula", "Bhiwani", "Sirsa"],
  "Himachal Pradesh": ["Shimla", "Mandi", "Solan", "Dharamshala", "Kullu"],
  "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh", "Deoghar"],
  "Karnataka": ["Bengaluru", "Bangalore", "Mysuru", "Mysore", "Mangaluru", "Mangalore", "Hubli", "Hubballi", "Dharwad", "Belagavi", "Belgaum", "Kalaburagi", "Gulbarga", "Davanagere", "Ballari", "Bellary", "Shivamogga", "Shimoga", "Tumakuru", "Tumkur", "Udupi", "Manipal", "Vijayapura", "Bijapur", "Hassan", "Bidar"],
  "Kerala": ["Kochi", "Cochin", "Ernakulam", "Thiruvananthapuram", "Trivandrum", "Kozhikode", "Calicut", "Thrissur", "Kollam", "Kannur", "Kottayam", "Palakkad", "Alappuzha", "Malappuram", "Kasaragod", "Pathanamthitta", "Perinthalmanna", "Thalassery", "Manjeri", "Tirur"],
  "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Rewa", "Satna", "Ratlam", "Dewas"],
  "Maharashtra": ["Mumbai", "Bombay", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad", "Chhatrapati Sambhajinagar", "Solapur", "Kolhapur", "Amravati", "Navi Mumbai", "Kalyan", "Vasai-Virar", "Sangli", "Akola", "Latur", "Jalgaon", "Ahmednagar", "Nanded", "Satara", "Pimpri-Chinchwad", "Dhule"],
  "Manipur": ["Imphal"],
  "Meghalaya": ["Shillong"],
  "Mizoram": ["Aizawl"],
  "Nagaland": ["Kohima", "Dimapur"],
  "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Brahmapur", "Sambalpur", "Puri", "Balasore"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Pathankot", "Hoshiarpur", "Moga"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer", "Bhilwara", "Alwar", "Sikar", "Bharatpur", "Sri Ganganagar"],
  "Sikkim": ["Gangtok"],
  "Tamil Nadu": ["Chennai", "Madras", "Coimbatore", "Madurai", "Tiruchirappalli", "Trichy", "Salem", "Tirunelveli", "Tiruppur", "Vellore", "Erode", "Thoothukudi", "Tuticorin", "Thanjavur", "Dindigul", "Kanchipuram", "Nagercoil", "Karur", "Hosur", "Cuddalore", "Kumbakonam"],
  "Telangana": ["Hyderabad", "Secunderabad", "Warangal", "Karimnagar", "Nizamabad", "Khammam", "Mahbubnagar", "Nalgonda"],
  "Tripura": ["Agartala"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj", "Allahabad", "Noida", "Greater Noida", "Bareilly", "Aligarh", "Moradabad", "Gorakhpur", "Saharanpur", "Jhansi", "Mathura", "Firozabad", "Ayodhya"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh", "Nainital"],
  "West Bengal": ["Kolkata", "Calcutta", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Kharagpur", "Haldia"],
  "Chandigarh": ["Chandigarh"],
  "Delhi": ["Delhi", "New Delhi"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla"],
  "Ladakh": ["Leh"],
  "Puducherry": ["Puducherry", "Pondicherry"],
  "Andaman and Nicobar Islands": ["Port Blair"],
};

const CITY_STATE = new Map<string, string>();
for (const [state, cities] of Object.entries(BY_STATE)) for (const c of cities) CITY_STATE.set(c.toLowerCase(), state);

/** The Indian state for a bare city name, or null if it isn't a known Indian city. */
export const indianStateOf = (city: string): string | null => CITY_STATE.get((city || "").trim().toLowerCase()) ?? null;
