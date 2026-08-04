/**
 * All 28 Indian states + 8 union territories, each with a representative
 * set of major cities (state/UT capitals plus other well-known cities).
 * Not an exhaustive census-town list -- deliberately just enough real,
 * correctly-named cities per state to make the College Admin's cascading
 * State -> City picker useful in practice.
 */
export interface IndiaState {
  name: string;
  cities: string[];
}

export const INDIA_STATES_AND_CITIES: IndiaState[] = [
  { name: "Andhra Pradesh", cities: ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Kadapa", "Tirupati", "Rajahmundry", "Kakinada", "Anantapur", "Eluru", "Ongole"] },
  { name: "Arunachal Pradesh", cities: ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila", "Along", "Tezu"] },
  { name: "Assam", cities: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon", "Dhubri", "Karimganj"] },
  { name: "Bihar", cities: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Begusarai", "Chapra", "Katihar", "Munger", "Bihar Sharif"] },
  { name: "Chhattisgarh", cities: ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Jagdalpur", "Raigarh", "Ambikapur"] },
  { name: "Goa", cities: ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim"] },
  { name: "Gujarat", cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Junagadh", "Gandhinagar", "Anand", "Nadiad", "Morbi", "Bharuch"] },
  { name: "Haryana", cities: ["Faridabad", "Gurugram", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar", "Karnal", "Sonipat", "Panchkula", "Bhiwani", "Sirsa"] },
  { name: "Himachal Pradesh", cities: ["Shimla", "Mandi", "Solan", "Dharamshala", "Kullu", "Bilaspur", "Una", "Hamirpur", "Nahan"] },
  { name: "Jharkhand", cities: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar", "Hazaribagh", "Giridih", "Ramgarh"] },
  { name: "Karnataka", cities: ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi", "Davanagere", "Ballari", "Tumakuru", "Shivamogga", "Bidar", "Kalaburagi", "Udupi"] },
  { name: "Kerala", cities: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Alappuzha", "Kannur", "Kottayam", "Palakkad", "Malappuram"] },
  { name: "Madhya Pradesh", cities: ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa"] },
  { name: "Maharashtra", cities: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Chhatrapati Sambhajinagar", "Solapur", "Kolhapur", "Amravati", "Navi Mumbai", "Akola", "Latur"] },
  { name: "Manipur", cities: ["Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Kakching"] },
  { name: "Meghalaya", cities: ["Shillong", "Tura", "Jowai", "Nongstoin", "Baghmara"] },
  { name: "Mizoram", cities: ["Aizawl", "Lunglei", "Champhai", "Serchhip", "Kolasib"] },
  { name: "Nagaland", cities: ["Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha"] },
  { name: "Odisha", cities: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri", "Balasore", "Bhadrak"] },
  { name: "Punjab", cities: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Pathankot", "Hoshiarpur", "Moga"] },
  { name: "Rajasthan", cities: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer", "Bhilwara", "Alwar", "Sikar"] },
  { name: "Sikkim", cities: ["Gangtok", "Namchi", "Gyalshing", "Mangan"] },
  { name: "Tamil Nadu", cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Erode", "Vellore", "Thoothukudi", "Dindigul"] },
  { name: "Telangana", cities: ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", "Ramagundam", "Mahbubnagar"] },
  { name: "Tripura", cities: ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar"] },
  { name: "Uttar Pradesh", cities: ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj", "Bareilly", "Aligarh", "Moradabad", "Noida", "Gorakhpur"] },
  { name: "Uttarakhand", cities: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Rishikesh", "Nainital"] },
  { name: "West Bengal", cities: ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Kharagpur"] },
  // Union territories
  { name: "Andaman and Nicobar Islands", cities: ["Port Blair"] },
  { name: "Chandigarh", cities: ["Chandigarh"] },
  { name: "Dadra and Nagar Haveli and Daman and Diu", cities: ["Silvassa", "Daman", "Diu"] },
  { name: "Delhi", cities: ["New Delhi", "Dwarka", "Rohini", "Karol Bagh", "Saket", "Janakpuri"] },
  { name: "Jammu and Kashmir", cities: ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Udhampur"] },
  { name: "Ladakh", cities: ["Leh", "Kargil"] },
  { name: "Lakshadweep", cities: ["Kavaratti"] },
  { name: "Puducherry", cities: ["Puducherry", "Karaikal", "Yanam", "Mahe"] },
];
