/**
 * Embedded MCA Data for SIT Scholar
 * Contains faculty information, department details, and student data
 * This data is loaded directly into the system for reliable search results
 */

import { Document, SourceType } from '../types';

// ==================== MCA FACULTY DATA ====================
export interface FacultyMember {
    name: string;
    designation: string;
    phone: string;
    email?: string;
    qualification: string;
    experience: string;
    researchAreas: string[];
    profileUrl: string;
}

export const MCA_FACULTY: FacultyMember[] = [
    {
        name: "Dr. Premasudha B G",
        designation: "Professor & Head of Department",
        phone: "080-27757220",
        email: "premasudha@sit.ac.in",
        qualification: "Ph.D, MCA",
        experience: "25+ years",
        researchAreas: ["Data Mining", "Machine Learning", "Image Processing"],
        profileUrl: "http://sit.ac.in/html/department.php?deptid=15"
    },
    {
        name: "Dr. Asha Gowda Karegowda",
        designation: "Associate Professor",
        phone: "9844327268",
        email: "ashagowda@sit.ac.in",
        qualification: "Ph.D (VTU 2013), M.Phil, MCA",
        experience: "Since 1998",
        researchAreas: ["Data Mining", "Digital Image Processing", "Deep Learning", "Wireless Sensor Networks"],
        profileUrl: "https://sit.irins.org/profile/91103"
    },
    {
        name: "Dr. Vijaya Kumar H S",
        designation: "Assistant Professor",
        phone: "9844521479",
        email: "vijayakumar@sit.ac.in",
        qualification: "Ph.D (VTU 2020), M.Phil, MCA",
        experience: "Since 2000",
        researchAreas: ["Image Processing", "Evolutionary Computing", "Computer Networks", "Soft Computing"],
        profileUrl: "https://sit.irins.org/profile/91105"
    },
    {
        name: "Dr. Bhanuprakash C",
        designation: "Assistant Professor",
        phone: "9844418422",
        email: "bhanuprakash@sit.ac.in",
        qualification: "Ph.D, MCA (Bangalore University 1998)",
        experience: "Since 2001",
        researchAreas: ["Database Applications", "Data Mining", "Big Data Analytics", "Soft Computing"],
        profileUrl: "https://sit.irins.org/profile/91109"
    },
    {
        name: "Mr. Venkata Reddy Y",
        designation: "Assistant Professor",
        phone: "8088004356",
        email: "venkatareddy@sit.ac.in",
        qualification: "MCA (Osmania University 2006)",
        experience: "Since 2008",
        researchAreas: ["J2EE", "Web Programming", "Python", "RDBMS"],
        profileUrl: "https://sit.irins.org/profile/91119"
    },
    {
        name: "Deepak Rao T K",
        designation: "Instructor",
        phone: "9901995908",
        email: "deepak_tk@sit.ac.in",
        qualification: "Diploma in Computer Science & Engineering",
        experience: "Lab Instructor",
        researchAreas: ["VB", "MS Office"],
        profileUrl: "http://sit.ac.in/html/department.php?deptid=15"
    }
];

// ==================== MCA DEPARTMENT INFO ====================
export const MCA_DEPARTMENT_INFO = {
    name: "Department of Master of Computer Applications (MCA)",
    established: 1994,
    intake: 60,
    duration: "2 years",
    affiliation: "Visvesvaraya Technological University (VTU)",
    approval: "AICTE",
    autonomous: true,
    autonomousSince: 2008,
    hod: "Dr. Premasudha B G",
    vision: "To effectively mould quality and responsible computer professionals with a service mindset and spirituality for nurturing the global technological competence",
    mission: [
        "To develop computer professionals with technical proficiency, soft skills, ethical values, and a service-oriented mindset",
        "To foster research, innovation, and problem-solving skills catering to the needs of industry, academia, and society",
        "To promote entrepreneurship and continuous adaptability to emerging technologies"
    ],
    placementRate: "90%",
    recruitingCompanies: ["TCS", "Infosys", "Wipro", "Accenture", "Aricent", "HP India", "Siemens"],
    researchCenter: true,
    phdGuides: 2,
    phdCompleted: 7
};

// ==================== GOLD MEDALISTS ====================
export const GOLD_MEDALISTS = [
    { year: 2024, name: "KRUTIKA KOTI", usn: "1SI22MC027" },
    { year: 2023, name: "SHRUTHI T N", usn: "1SI21MC047" },
    { year: 2022, name: "CHANDANA N", usn: "1SI20MC005" },
    { year: 2022, name: "Tara K N", usn: "1SY19MCA20" },
    { year: 2021, name: "Devika M J", usn: "1SI18MCA05" },
    { year: 2020, name: "Apoorva H K", usn: "1SI18MCA50" },
    { year: 2019, name: "Sushmitha T M", usn: "1SI16MCA46" },
    { year: 2018, name: "Pavan B G", usn: "1SI15MCA23" },
];

// ==================== 3RD SEMESTER 2024-2026 STUDENTS ====================
// Sample student data (from PDF - full data would be parsed)
export interface Student {
    name: string;
    usn: string;
    phone?: string;
    address?: string;
    semester: string;
    batch: string;
}

export const MCA_STUDENTS_2024_2026: Student[] = [
    // Note: This would be populated from the PDF
    // For now, including sample structure
    { name: "Sample Student 1", usn: "1SI24MC001", semester: "3rd", batch: "2024-2026" },
    { name: "Sample Student 2", usn: "1SI24MC002", semester: "3rd", batch: "2024-2026" },
];

// ==================== CONVERT TO DOCUMENTS FOR SEARCH ====================
export function getEmbeddedDocuments(): Document[] {
    const documents: Document[] = [];
    const now = Date.now();

    // Faculty Documents
    documents.push({
        id: 'mca-faculty-list',
        title: 'MCA Department Faculty List',
        content: MCA_FACULTY.map(f =>
            `${f.name} - ${f.designation}
Phone: ${f.phone}
Email: ${f.email || 'N/A'}
Qualification: ${f.qualification}
Experience: ${f.experience}
Research Areas: ${f.researchAreas.join(', ')}`
        ).join('\n\n'),
        category: 'Faculty',
        sourceType: SourceType.INTERNAL,
        isRestricted: false,
        uploadedAt: now,
        citation: 'http://sit.ac.in/html/department.php?deptid=15'
    });

    // HOD Document
    const hod = MCA_FACULTY[0];
    documents.push({
        id: 'mca-hod',
        title: 'MCA HOD - Head of Department',
        content: `The Head of Department (HOD) of MCA at SIT is ${hod.name}.

Name: ${hod.name}
Designation: ${hod.designation}
Phone: ${hod.phone}
Email: ${hod.email}
Qualification: ${hod.qualification}

The MCA department was established in 1994 and became autonomous in 2008.`,
        category: 'Faculty',
        sourceType: SourceType.INTERNAL,
        isRestricted: false,
        uploadedAt: now,
        citation: 'http://sit.ac.in/html/department.php?deptid=15'
    });

    // Department Info
    documents.push({
        id: 'mca-department-info',
        title: 'MCA Department Overview',
        content: `Department: ${MCA_DEPARTMENT_INFO.name}
Established: ${MCA_DEPARTMENT_INFO.established}
Intake: ${MCA_DEPARTMENT_INFO.intake} students
Duration: ${MCA_DEPARTMENT_INFO.duration}
Affiliation: ${MCA_DEPARTMENT_INFO.affiliation}
Autonomous Since: ${MCA_DEPARTMENT_INFO.autonomousSince}

HOD: ${MCA_DEPARTMENT_INFO.hod}

Vision: ${MCA_DEPARTMENT_INFO.vision}

Mission:
${MCA_DEPARTMENT_INFO.mission.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Placement Rate: ${MCA_DEPARTMENT_INFO.placementRate}
Recruiting Companies: ${MCA_DEPARTMENT_INFO.recruitingCompanies.join(', ')}

Research Center: Yes
PhD Guides: ${MCA_DEPARTMENT_INFO.phdGuides}
PhDs Completed: ${MCA_DEPARTMENT_INFO.phdCompleted}`,
        category: 'Department',
        sourceType: SourceType.INTERNAL,
        isRestricted: false,
        uploadedAt: now,
        citation: 'http://sit.ac.in/html/department.php?deptid=15'
    });

    // Gold Medalists
    documents.push({
        id: 'mca-gold-medalists',
        title: 'MCA Gold Medalists',
        content: `Gold Medalists from MCA Department:

${GOLD_MEDALISTS.map(g => `${g.year}: ${g.name} (${g.usn})`).join('\n')}

The MCA department has a strong track record of producing university rank holders and gold medalists.`,
        category: 'Achievements',
        sourceType: SourceType.INTERNAL,
        isRestricted: false,
        uploadedAt: now,
        citation: 'http://sit.ac.in/html/department.php?deptid=15'
    });

    // Individual Faculty Documents
    MCA_FACULTY.forEach((faculty, idx) => {
        documents.push({
            id: `faculty-${idx}`,
            title: `${faculty.name} - ${faculty.designation}`,
            content: `Name: ${faculty.name}
Designation: ${faculty.designation}
Department: MCA, Siddaganga Institute of Technology
Phone: ${faculty.phone}
Email: ${faculty.email || 'N/A'}
Qualification: ${faculty.qualification}
Experience: ${faculty.experience}
Research Areas: ${faculty.researchAreas.join(', ')}
Profile: ${faculty.profileUrl}`,
            category: 'Faculty',
            sourceType: SourceType.INTERNAL,
            isRestricted: false,
            uploadedAt: now,
            citation: faculty.profileUrl
        });
    });

    // SIT General Info
    documents.push({
        id: 'sit-general',
        title: 'Siddaganga Institute of Technology (SIT) Overview',
        content: `Siddaganga Institute of Technology (SIT)
Location: Tumkur, Karnataka, India
Type: Autonomous Engineering College
Established: 1963
Affiliation: Visvesvaraya Technological University (VTU), Belagavi
Approval: AICTE

Principal: Dr. Shivakumara Swamy

SIT is one of the premier engineering institutions in Karnataka, known for its quality education and strong placement record. The institute offers undergraduate, postgraduate, and doctoral programs in various engineering disciplines.

Key Features:
- Autonomous institution with academic freedom
- Strong industry connections
- Excellent placement record
- Well-equipped laboratories
- Experienced faculty
- Hostel facilities for students`,
        category: 'Institution',
        sourceType: SourceType.INTERNAL,
        isRestricted: false,
        uploadedAt: now,
        citation: 'https://sit.ac.in'
    });

    return documents;
}

// ==================== STUDENT DATA PARSER (for PDF) ====================
// This would parse the PDF content when loaded
export function parseStudentPDF(textContent: string): Student[] {
    const students: Student[] = [];
    const lines = textContent.split('\n');

    // Pattern matching for student data
    const usnPattern = /1SI\d{2}MC\d{3}/i;
    const phonePattern = /\d{10}/;

    for (const line of lines) {
        const usnMatch = line.match(usnPattern);
        if (usnMatch) {
            const phoneMatch = line.match(phonePattern);
            students.push({
                name: line.split(usnMatch[0])[0].trim(),
                usn: usnMatch[0],
                phone: phoneMatch ? phoneMatch[0] : undefined,
                semester: "3rd",
                batch: "2024-2026"
            });
        }
    }

    return students;
}
