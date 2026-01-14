// In a real application, these would be env vars or fetched from a config service.
export const APP_NAME = "SIT Scholar";

export const TRUSTED_DOMAINS = [
  "sit.ac.in",
  "sit.ac.in/html/department.php?deptid=15",
  "sit.ac.in/html/home.html"
];

// Extracted and Structured Data from the provided OCR Text
const ALUMNI_DATA_SAMPLE = `
| Name | Batch | Designation/Company | Email | Contact |
|------|-------|---------------------|-------|---------|
| Bharadhwaja,C,G | 1994 | - | - | - |
| Deepu | 1994 | - | - | - |
| Dr .Premasudha B G | 1994 | PROFESSOR and Head, DEPT OF MCA, SIT | bgpremasudha@gmail.com | 9845238744 |
| Dr. Asha Gowda Karegowda | 1994 | Associate Professor, SIT | ashagksit@gmail.com | 9844327268 |
| Dr. RAJANI NARAYAN | 1994 | RNS Institute of Technology | rajaninarayan@rnsit.ac.in | +91-8050262021 |
| Kumar NV | 1994 | Infosys Ltd | kumarbang@gmail.com | 9448892955 |
| Ravi Herunde | 1994 | Alexa Catalog Service, Amazon | raviherunde@yahoo.com | 26032 Miralinda, USA |
| Seshaphani B | 1994 | Capgemini | phani18.b@gmail.com | - |
| T M Kiran Kumar | 1994 | Assistant Professor, SIT | tmkiran@sit.ac.in | 9844379612 |
| Vijayalakshmi.M.N | 1994 | RV College of Engineeeing | vijayalakshmi@gmail.com | 9986551776 |
| Amitha | 1995 | - | - | - |
| Chandrashekhar M K | 1995 | HP | Chandramk@gmail.com | - |
| Dr. C Bhanuprakash | 1995 | Assistant Professor, SIT | bhanuprakashc@hotmail.com | - |
| Dr. H S Vijaya Kumar | 1995 | - | sitvijay@gmail.com | - |
| Harish SC | 1995 | - | harish.sidapura@gmail.com | - |
| Harsha Sathyanarayana | 1995 | - | Harshags@yahoo.com | - |
| M C SUPRIYA | 1995 | Sri Siddartha institute technology | supriya.mc9@gmail.com | - |
| Manoj Kumar Durgam | 1995 | UST Global | - | - |
| Nagaprasad S | 1995 | LBrands | nprasads@gmail.com | - |
| POORNIMA D | 1995 | RRIT | poornimarajud@gmail.com | - |
| Prasanna Inamdar | 1995 | SENSEOPS Tech Solutions | inpras@gmail.com | - |
| Ramaprasad.P | 1995 | DOT, USA | Rama.Pokala@gmail.com | - |
| Sreevathsava N V | 1995 | TCS | sreevathsava.nv@gmail.com | - |
| Trinath Babu Areti | 1995 | ValueMomentum Software | Trinathbabu@gmail.com | 9900100114 |
| Vijay Ganapathy | 1995 | Deloitte | - | - |
| Vishwanath Patil | 1995 | Wabtec Corporation | Vishwaraj249@gmail.com | - |
| ZAKIR HUSSAIN | 1995 | NAJRAN UNIVERSITY | hussain.zaks@gmail.com | - |
| Arcot Sreelatha | 1996 | - | - | - |
| B.Sanjay | 1996 | Amazon Seattle, USA | sanjayba@amazon.com | +14256477790 |
| B.Vamshi Krishnamohan | 1996 | CAPGEMINI AMERICA | Vamsi-Krishna.Bhupalam@Capgemini.com | 6038416465 |
| Badri Narayanan | 1996 | Cognizant Technology Solutions | - | 9866679680 |
| ChannabasavannaGoud V Patil | 1996 | IBM | cvpatilbly@outlook.com | 919632066822 |
| Geetha.B.R | 1996 | SRK Softwares | brgeetha@gmail.com | 9741089756 |
| H K VIRUPAKSHAIAH | 1996 | DEPARTMENT OF MCA, SIT | viru@sit.ac.in | 9448701608 |
| Jaya Mala | 1996 | - | - | 9886857157 |
| Jyothimaya Mohanty | 1996 | Chip Mong Bank Plc | joemohanty@gmail.com | 855966344888 |
| Karthik.K | 1996 | - | - | 9686796333 |
| Norman George | 1996 | - | - | 9886051014 |
| Rajesh.K | 1996 | - | - | 9900106934 |
| Rashmi.T.P | 1996 | - | - | 9900269292 |
| Ravikumar.k | 1996 | - | - | - |
| Shreeharsha.H.B | 1996 | Director Engineering @ OneTrust | shreeharsha.hb@gmail.com | - |
| Shylaja V | 1996 | Wipro Technologies | Shylaja.siddesh@gmail.com | - |
| Shylaja.K.P | 1996 | B.M.S College of Engineering | shailaja.mca@bmsce.ac.in | 9739097570 |
| Dr. Suma.R | 1996 | Associate Professor, SSIT | sumaraviram@gmail.com | 8296515542 |
| Suma.S | 1996 | Teaching | suma-mcavtu@dayanandasagar.edu | 8095478002 |
| Venkataraghavan.G.S | 1996 | Faire | venkat.gandur@gmail.com | - |
| Vidya S | 1996 | REVA UNIVERSITY | vidya.s@reva.edu.in | 6508148813 |
| Abraham Easow | 1997 | - | - | - |
| Alexander Wilson | 1997 | Ericsson AB | alex_wils@hotmail.com | 971585813313 |
| Amaresh Dhal | 1997 | Sonata Software ltd | amaresh_dhal@yahoo.com | 9845266246 |
| E Sreenivasagouda | 1997 | - | Sreenivasa.goud@gmail.com | +1 (614) 619-3234 |
| Hariharan Srinivasan | 1997 | ABB Global Industries | hariharan.srinivasan@in.abb.com | 9886742740 |
| Jethendra B Malapur | 1997 | - | - | - |
| Kakarla Bheemasekhar | 1997 | - | kakarlas20@gmail.com | - |
| Kanhaiya Prasad | 1997 | - | - | - |
| Mishra Chittaranjan | 1997 | New York | Chittaranjan.Mishra@cognizant.com | 6028242104 |
| Naveen M A | 1997 | Oracle | nma0810@gmail.com | - |
| Potla Ramakrishna | 1997 | Bourns Inc | Potlar2@gmail.com | - |
| Raghavendra K H | 1997 | - | raghavendrakanoor@gmail.com | 09480546372 |
| Sathyanarayana Reddy A T | 1997 | Teaching Profession | atsbabu@rymec.in | 9740100941 |
| Shilpa B N | 1997 | Metro cash and carry | Shilpa.gnanesh@metro.co.in | 9108510545 |
| Sudhakar Naidu R | 1997 | City Of Chicago | sudhakarnaidu.r@gmail.com | - |
| Sujoy Deb | 1997 | Capgemini Hyderabad | sujoy.deb@capgemini.com | 7032210680 |
| Ravindra kumar S Muttagi | 1998 | TATA CONSULTANCY SERVICES | ravimuttagi@hotmail.com | - |
| Sheshadhri | 1998 | Mindtree | sheshadhri.rao@gmail.com | - |
| Pradeep Chandramouli | 1998 | Oracle Software | - | - |
| cms | 1999 | Adobe (Sr QA) | cms@adobe.com | 961155559 |
| Kiran Nittur | 1999 | Hitachi Vantara | kiran.nittur@hitachivantara.com | 7899154736 |
| Sridhar Yenugula | 1999 | Accenture | Sridhar.yenugula@accenture.com | 9980016724 |
| Abhijith Kumar | 2000 | - | - | - |
| Chedullah Ramesh Babu | 2000 | Adea Solutions Pvt Ltd | chedullarameshbabu@yahoo.com | - |
| Manjunath Kargal | 2000 | Syniverse Technologies | mkargal@gmail.com | - |
| Anup Mishra | 2001 | Oracle India Pvt Ltd | anupmishra18@yahoo.co.in | - |
| Chamaraju Mollegowda | 2001 | LightSurf Technologies | chamarajum@yahoo.com | - |
| Kunal Gowtham | 2001 | Orange Telecommunications | kunalgautam@hotmail.com | - |
| Malapati Raghavendra | 2001 | IBM India Pvt Ltd | malapati.raghavendra@gmail.com | - |
| Narender | 2001 | - | narender_india@rediffmail.com | - |
| Prabhakar H V | 2001 | Virtusa Corporation | prabhakar.hv@gmail.com | - |
| R Mahesh | 2001 | - | r.mahesh123@gmail.com | - |
| Sanjeev Kumar | 2001 | - | sanjeevraj2000@yahoo.com | - |
| Shashidhar S | 2001 | Encora Innovations | javashashi@gmail.com | 9972740943 |
| Soumyajith Kundu | 2001 | IBM Pvt Ltd | soumyajit.kundu@in.ibm.co | - |
| Girish Kotr | 2001 | - | girish_kotr@rediffmail.com | - |
| Vishal Gaurav | 2001 | TCS | vishal_gaurav2000@yahoo.co.in | - |
| G S Bharath | 2002 | Govt First Grade College | gsbgs19@gmail.com | 9886427816 |
| Harsha K N | 2002 | HCL America Inc | Harsha.kore@hcl.com | 14842410191 |
| K Prashanth | 2002 | RV College of Engineering | prashanthk@rvce.edu.in | 9380651304 |
| Nagabhushana M S | 2002 | Mphasis Ltd. | Nagabhushana.M@mphasis.com | 7829984029 |
| Prashanth G k | 2002 | SIT, Tumkur | Prashanthgk@sit.ac.in | +919980933552 |
| Sandeep D | 2002 | ANZ Support Services | Sandeep.d@anz.com | 9916229740 |
| Vikas Kumar | 2002 | Infosys Public Service | Vikas_Kumar18@infosys.com | +1-5109444612 |
| ANAND.R | 2003 | Adobe Systems | ananr@adobe.com | 9845078983 |
| ARUNANGSHU SARKAR | 2003 | HCL | arunangshu.sarkar@gmail.com | +447459113791 |
| AYYAPPA SRINIVAS SUDHEER | 2003 | Cisco | sdontams@cisco.com | 9000222410 |
| BHARATHI H | 2003 | - | Bharati.Patil@Amway.com | +601121002677 |
| BHASKAR S.P. | 2003 | Adobe | bhaskar.suryaprakash@gmail.com | 9986404255 |
| KAVYASHREE.N | 2003 | Dr.Ambedkar Institute | kavyashree.mca@drait.edu.in | 9972641659 |
| LAVANYA S.R. | 2003 | Oracle | lavanya03sr@gmail.com | +9972096292 |
| AMITH G A | 2004 | TD Bank | amithanandss@gmail.com | 12892337616 |
| ANITHA R | 2004 | TICM | anitha.ticm@gmail.com | 9008781641 |
| ANUJ GOEL | 2004 | Techmahindra | Anuj.Goel@techmahindra.com | 9886544320 |
| ASHOK B P | 2004 | Oxford college of engineering | ashokbp.mca@gmail.com | 8867541181 |
| GIRISH R B | 2004 | Fiserv India | girish.bodake@fiserv.com | 9743436589 |
| HARVINDER JIT SINGH BALI | 2004 | Civil Secretariat Jammu | harvinder.itjk@gmail.com | 9419228417 |
| HONNAIAH | 2004 | - | honnaiah82@yahoo.com | 9916995166 |
| MANJESH.M | 2004 | ASC Degree College | asc.manjeshm@gmail.com | 9886433575 |
| MILI.K | 2004 | Tech Mahindra | mili.kadiyala@gmail.com | 9945274647 |
| NARENDRA T V | 2004 | Huawei Technologies | narendra.t.v1@huawei.com | 9845225005 |
| NAVINKUMAR MATH | 2004 | Robosoft Technologies | naveen.math@robosoftin.com | 9538358388 |
| PRADEEP PALTANAKAR | 2004 | State Street | PAPaltanakar@statestreet.com | +16177128524 |
| PRAVEEN KUMAR S PATIL | 2004 | Aris Global Software | praveen.patil@arisglobal.com | 9886345481 |
| RAGHUNATH.G | 2004 | Capgemini India | raghunath.gopinath@capgemini.com | 8105281804 |
| RASHMI | 2004 | Honeywell Intl | Rashmi.patil@honeywell.com | 9663528282 |
| SHASHIKANT TELI | 2004 | Wipro Technologies | shashi.teli@wipro.com | 8861200526 |
| SHIV KUMAR PATHANIA | 2004 | - | shiv.pathania@rediffmail.com | - |
| SRIKANT P. DESHPANDE | 2004 | IBM | srikantd@cn.ibm.com | 8618662150407 |
| SUHAIL AHMED | 2004 | HCL | suhail.ahamed@hcl.com | 9986814404 |
| SWETHA.M | 2004 | Aflac NI | Swethakamal@gmail.com | 07872934135 |
| VASUNDHARA B.K. | 2004 | - | vasundhara.bk@gmail.com | 9482213888 |
| VIKRAM BHARADWAJ | 2004 | - | vikrambharadwaj@gmail.com | 9740645705 |
| RAGHAVENDRA C S | 2008 | Wipro | raghavendra.s29@wipro.com | 9916824297 |
| ABHIJIT B ASHTAPUTRE | 2010 | Abhijit | abhi.ashtaputre@gmail.com | 7411818143 |
| ANIL KUMAR K S | 2011 | TCS | anil.ks1@tcs.com | 8050310962 |
| AMITH KUMAR N R | 2012 | Infosys limited | amithkumar.n@infosys.com | 9731869307 |
| ANIRBAN PARAMANIK | 2014 | DealerSocket | anirbanpramanik127@gmail.com | - |
| AKARSHA I K | 2016 | G7CR Cloud Technologies | Akarsh.Itigi@g7cr.in | 7795188730 |
| AMEENA KHANUM | 2017 | Accenture solutions | ameenakhanum95@gmail.com | 9945219654 |
| ASHWINI | 2018 | Elait IT technology | Ashwini.kashinath@elait.com | 8310063362 |
`;

const MCA_2026_BATCH_DATA = `
| Name | USN | DOB | Mobile | Email | Proctor |
|------|-----|-----|--------|-------|---------|
| ACHYUTH U S | 1SI24MC001 | 16/07/2001 | 9148686067 | 1si24mc001@sit.ac.in | Dr. H S Vijaya Kumar |
| AISHWARYA P | 1SI24MC002 | 29/01/2003 | 6362606334 | 1si24mc002@sit.ac.in | Dr. H S Vijaya Kumar |
| AKASH Y | 1SI24MC003 | 26/02/2004 | 6363614954 | 1si24mc003@sit.ac.in | Dr. H S Vijaya Kumar |
| AMRUTHESH C M | 1SI24MC004 | 06/04/2002 | 7204039067 | 1si24mc004@sit.ac.in | Dr. H S Vijaya Kumar |
| ANNAPURNESHWARI M U | 1SI24MC005 | 15/09/2003 | 9019852093 | 1si24mc005@sit.ac.in | Dr. H S Vijaya Kumar |
| ASHITH JAIN B N | 1SI24MC006 | 22/01/2002 | 7349618040 | 1si24mc006@sit.ac.in | Dr. H S Vijaya Kumar |
| BASAVARAJ N | 1SI24MC007 | 14/02/2003 | 6363602591 | 1si24mc007@sit.ac.in | Dr. H S Vijaya Kumar |
| BHARATHI S | 1SI24MC008 | 21/07/2002 | 8088287351 | 1si24mc008@sit.ac.in | Dr. H S Vijaya Kumar |
| BINDHU SREE K S | 1SI24MC009 | 13/07/2003 | 8904464903 | 1si24mc009@sit.ac.in | Dr. H S Vijaya Kumar |
| BINDHUSHREE T R | 1SI24MC010 | 19/05/2003 | 8050020429 | 1si24mc010@sit.ac.in | Dr. H S Vijaya Kumar |
| DARSHAN H D | 1SI24MC011 | 29/05/2002 | 8105634796 | 1si24mc011@sit.ac.in | Dr. H S Vijaya Kumar |
| DARSHAN K N | 1SI24MC012 | 28/10/2002 | 8088562474 | 1si24mc012@sit.ac.in | Dr. H S Vijaya Kumar |
| DARSHAN SHANKAR NAIK | 1SI24MC013 | 22/02/2004 | 9535598827 | 1si24mc013@sit.ac.in | Dr. H S Vijaya Kumar |
| DHANUSH N G | 1SI24MC014 | 15/09/2002 | 9019374026 | 1si24mc014@sit.ac.in | Dr. H S Vijaya Kumar |
| GEETHA | 1SI24MC015 | 09/03/2003 | 9019536193 | 1si24mc015@sit.ac.in | Dr. H S Vijaya Kumar |
| HARSHA T | 1SI24MC016 | 14/03/2003 | 6364105159 | 1si24mc016@sit.ac.in | Dr. H S Vijaya Kumar |
| HARSHITHA H | 1SI24MC017 | 07/08/2002 | 6363323303 | 1si24mc017@sit.ac.in | Dr. H S Vijaya Kumar |
| JAGADISH S NAYAKALLAMATH | 1SI24MC018 | 11/07/2000 | 9449523330 | 1si24mc018@sit.ac.in | Dr. H S Vijaya Kumar |
| JEEVAN G | 1SI24MC019 | 16/08/2003 | 9686585450 | 1si24mc019@sit.ac.in | Mr. H K Virupakshaiah |
| KAVITHA S | 1SI24MC020 | 13/05/2003 | 8431772908 | 1si24mc020@sit.ac.in | Mr. H K Virupakshaiah |
| KHUSHI J | 1SI24MC021 | 25/01/2004 | 9019854409 | 1si24mc021@sit.ac.in | Mr. H K Virupakshaiah |
| KIRAN K G | 1SI24MC022 | 26/01/2002 | 6360219484 | 1si24mc022@sit.ac.in | Mr. H K Virupakshaiah |
| KUMAR SWAMY T G | 1SI24MC023 | 29/09/2002 | 8088600732 | 1si24mc023@sit.ac.in | Mr. H K Virupakshaiah |
| LIKITHA P KUMAR | 1SI24MC024 | 02/01/2004 | 8660290349 | 1si24mc024@sit.ac.in | Mr. H K Virupakshaiah |
| LINGADEVARU H P | 1SI24MC025 | 03/12/2003 | 9019746824 | 1si24mc025@sit.ac.in | Mr. H K Virupakshaiah |
| MADAN C G | 1SI24MC026 | 24/09/2003 | 9353865613 | 1si24mc026@sit.ac.in | Mr. H K Virupakshaiah |
| MADHUMITHA S | 1SI24MC027 | 31/07/2003 | 9482139571 | 1si24mc027@sit.ac.in | Mr. H K Virupakshaiah |
| MADHURA A M | 1SI24MC028 | 21/10/2003 | 9535109615 | 1si24mc028@sit.ac.in | Mr. H K Virupakshaiah |
| MANOJ M C | 1SI24MC029 | 01/03/2003 | 7892903614 | 1si24mc029@sit.ac.in | Mr. H K Virupakshaiah |
| MANOJ T L | 1SI24MC030 | 12/01/2004 | 8050529140 | 1si24mc030@sit.ac.in | Mr. H K Virupakshaiah |
| MOHITH K V | 1SI24MC031 | 31/07/2003 | 9353938681 | 1si24mc031@sit.ac.in | Mr. H K Virupakshaiah |
| NAGARAJU B | 1SI24MC032 | 13/06/2003 | 9632262361 | 1si24mc032@sit.ac.in | Mr. H K Virupakshaiah |
| NAGARAJU GARI VENKATESH | 1SI24MC033 | 14/08/2004 | 9110576542 | 1si24mc033@sit.ac.in | Mr. H K Virupakshaiah |
| NAYEEM M BADIWALE | 1SI24MC034 | 10/07/2002 | 8296509223 | 1si24mc034@sit.ac.in | Mr. H K Virupakshaiah |
| NEHA M A | 1SI24MC035 | 10/07/2003 | 9148727982 | 1si24mc035@sit.ac.in | Mr. H K Virupakshaiah |
| NISARGA C V | 1SI24MC036 | 24/05/2004 | 8088529606 | 1si24mc036@sit.ac.in | Mr. H K Virupakshaiah |
| NITHYA TEJASVI | 1SI24MC037 | 03/03/2003 | 7899422270 | 1si24mc037@sit.ac.in | Mr. H K Virupakshaiah |
| NUTHAN A M | 1SI24MC038 | 27/01/2003 | 9845541168 | 1si24mc038@sit.ac.in | Dr. Prashanth G K |
| PAVITHRA D | 1SI24MC039 | 12/05/2003 | 9972025251 | 1si24mc039@sit.ac.in | Dr. Prashanth G K |
| POOJA R | 1SI24MC040 | 09/06/2003 | 8296077558 | 1si24mc040@sit.ac.in | Dr. Prashanth G K |
| RAHUL H N | 1SI24MC041 | 06/04/2004 | 9632607249 | 1si24mc041@sit.ac.in | Dr. Prashanth G K |
| RANJITH C M | 1SI24MC042 | 27/11/2002 | 6361804007 | 1si24mc042@sit.ac.in | Dr. Prashanth G K |
| RANJITHA M R | 1SI24MC043 | 11/12/2002 | 8073228761 | 1si24mc043@sit.ac.in | Dr. Prashanth G K |
| RUTHIK B P | 1SI24MC044 | 14/05/2003 | 7624862079 | 1si24mc044@sit.ac.in | Dr. Prashanth G K |
| SANJANA S | 1SI24MC045 | 24/05/2003 | 8105540793 | 1si24mc045@sit.ac.in | Dr. Prashanth G K |
| SHASHIRAJ H B | 1SI24MC046 | 01/04/2002 | 9353042284 | 1si24mc046@sit.ac.in | Dr. Prashanth G K |
| SNEHASHREE N | 1SI24MC047 | 10/09/2003 | 8088816630 | 1si24mc047@sit.ac.in | Dr. Prashanth G K |
| SOUNDARYA | 1SI24MC048 | 09/11/2003 | 7019920492 | 1si24mc048@sit.ac.in | Dr. Prashanth G K |
| SUMAN P | 1SI24MC049 | 18/12/2003 | 7204286361 | 1si24mc049@sit.ac.in | Dr. Prashanth G K |
| VATHSALA G | 1SI24MC050 | 27/11/2003 | 6362305595 | 1si24mc050@sit.ac.in | Dr. Prashanth G K |
| VENKATESH NAIK R | 1SI24MC051 | 12/02/2003 | 9148485761 | 1si24mc051@sit.ac.in | Dr. Prashanth G K |
| VIDYASHREE D G | 1SI24MC052 | 20/12/2002 | 7676940379 | 1si24mc052@sit.ac.in | Dr. Prashanth G K |
| VIDYASHREE S R | 1SI24MC053 | 01/12/2002 | 7411449311 | 1si24mc053@sit.ac.in | Dr. Prashanth G K |
| VIKAS A | 1SI24MC054 | 20/09/2003 | 8867458794 | 1si24mc054@sit.ac.in | Dr. Prashanth G K |
| YOGEESH N | 1SI24MC055 | 02/10/2003 | 6361460140 | 1si24mc055@sit.ac.in | Dr. Prashanth G K |
`;

// Initial dummy data for the "Internal Documents" simulation
export const INITIAL_DOCS = [
  {
    id: '1',
    title: 'SIT MCA Alumni & Student Database (1994-2018)',
    content: ALUMNI_DATA_SAMPLE,
    category: 'student_list',
    isRestricted: true,
    dateUploaded: new Date().toISOString()
  },
  {
    id: '4',
    title: 'MCA Student List - Batch 2024-2026 (Currently 3rd Semester)',
    content: MCA_2026_BATCH_DATA,
    category: 'student_list',
    isRestricted: true,
    dateUploaded: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Faculty List & HOD Details (2024-25)',
    content: `
| Name | Designation | Email | Phone |
|------|-------------|-------|-------|
| Dr. Premasudha B G | Professor & Head (HOD) | bgpremasudha@gmail.com | 9845238744 |
| Dr. Asha Gowda Karegowda | Associate Professor | ashagksit@gmail.com | 9844327268 |
| Mr. T.M. Kirankumar | Assistant Professor | tmkiran@sit.ac.in | 9844379612 |
| Dr. H K VIRUPAKSHAIAH | Professor | viru@sit.ac.in | 9448701608 |

Department: Master of Computer Applications (MCA)
Institution: Siddaganga Institute of Technology (SIT), Tumkur
    `,
    category: 'faculty_file',
    isRestricted: false,
    dateUploaded: new Date().toISOString()
  },
  {
    id: '3',
    title: 'Hostel Fees & Facilities 2024',
    content: 'Boys Hostel Fees: ₹90,000/year (Mess included). Girls Hostel Fees: ₹95,000/year. Facilities: Wi-Fi, 24/7 Hot Water, Reading Room, Gym, Guest House.',
    category: 'other',
    isRestricted: false,
    dateUploaded: new Date().toISOString()
  }
];

// Switching to Gemini 2.5 family which has fresh quota
export const MODEL_MAIN = 'gemini-2.5-flash';
export const MODEL_TRANSCRIPTION = 'gemini-2.5-flash';
export const MODEL_TTS = 'gemini-2.5-flash-preview-tts';
export const MODEL_FAST_LITE = 'gemini-2.5-flash-lite-preview-09-2025';
